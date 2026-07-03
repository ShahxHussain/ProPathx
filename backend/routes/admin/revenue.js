import express from 'express';
import { supabase } from '../../config/database.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/revenue/stats
 * Revenue & payments overview for SuperAdmin (MRR estimate, trends, recent payments).
 */
router.get('/revenue/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawDays = parseInt(String(req.query.days ?? '30'), 10);
    const windowDays = [7, 30, 90].includes(rawDays) ? rawDays : 30;

    const { data: allCompleted } = await supabase
      .from('Payments')
      .select('Amount, PaymentDate, PaymentStatus, PaymentMethod, EntityType')
      .eq('PaymentStatus', 'Completed');

    const { data: allPayments } = await supabase
      .from('Payments')
      .select('PaymentID, Amount, PaymentDate, PaymentStatus, PaymentMethod, EntityType, TransactionID, SubscriptionID')
      .order('PaymentDate', { ascending: false })
      .limit(100);

    const totalRevenue =
      allCompleted?.reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0) || 0;

    const failedCount =
      (allPayments || []).filter((p) => p.PaymentStatus === 'Failed').length;
    const refundedCount =
      (allPayments || []).filter((p) => p.PaymentStatus === 'Refunded').length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mrr =
      (allCompleted || [])
        .filter((p) => p.PaymentDate && new Date(p.PaymentDate) >= monthStart)
        .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0) || 0;

    const { count: activeSubscriptions } = await supabase
      .from('Subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    const revenueStart = new Date();
    revenueStart.setDate(revenueStart.getDate() - windowDays);

    const { data: windowPayments } = await supabase
      .from('Payments')
      .select('Amount, PaymentDate, PaymentStatus')
      .eq('PaymentStatus', 'Completed')
      .gte('PaymentDate', revenueStart.toISOString())
      .order('PaymentDate', { ascending: true });

    const byDate = {};
    (windowPayments || []).forEach((p) => {
      const key = new Date(p.PaymentDate).toISOString().split('T')[0];
      byDate[key] = (byDate[key] || 0) + (parseFloat(p.Amount) || 0);
    });

    const revenueTrend = [];
    for (let i = windowDays - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      revenueTrend.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: Math.round(byDate[key] || 0),
      });
    }

    const byMethod = {};
    (allCompleted || []).forEach((p) => {
      const method = p.PaymentMethod || 'Unknown';
      byMethod[method] = (byMethod[method] || 0) + (parseFloat(p.Amount) || 0);
    });

    const byEntity = { Organization: 0, Student: 0 };
    (allCompleted || []).forEach((p) => {
      const t = p.EntityType || 'Organization';
      if (byEntity[t] != null) byEntity[t] += parseFloat(p.Amount) || 0;
    });

    res.json({
      stats: {
        totalRevenue: Math.round(totalRevenue),
        mrr: Math.round(mrr),
        activeSubscriptions: activeSubscriptions || 0,
        failedPayments: failedCount,
        refundedPayments: refundedCount,
        completedPayments: (allCompleted || []).length,
      },
      revenueTrend,
      paymentsByMethod: Object.entries(byMethod).map(([name, value]) => ({
        name,
        value: Math.round(value),
      })),
      revenueByEntity: Object.entries(byEntity).map(([name, value]) => ({
        name,
        value: Math.round(value),
      })),
      recentPayments: (allPayments || []).slice(0, 20),
    });
  } catch (error) {
    console.error('Revenue stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
