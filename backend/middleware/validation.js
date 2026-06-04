import { body, validationResult } from 'express-validator';

/**
 * Handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Organization signup validation rules
 */
export const validateOrgSignup = [
  body('orgName').trim().notEmpty().withMessage('Organization name is required'),
  body('orgEmail').trim().isEmail().withMessage('Valid organization email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  handleValidationErrors,
];

/**
 * Login validation rules
 */
export const validateLogin = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

/**
 * Student self-signup (public): individual / platform-level account (no organization)
 */
export const validateStudentSignup = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  handleValidationErrors,
];

/**
 * Create user validation rules (for OrgUsers)
 */
export const validateCreateUser = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('role')
    .isIn(['Reviewer', 'Subject Expert'])
    .withMessage('Role must be either "Reviewer" or "Subject Expert"'),
  handleValidationErrors,
];

/**
 * Create platform user validation rules (for Users table - global Reviewer/Subject Expert)
 */
export const validateCreatePlatformUser = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('role')
    .isIn(['Reviewer', 'Subject Expert'])
    .withMessage('Role must be either "Reviewer" or "Subject Expert"'),
  handleValidationErrors,
];

/**
 * Update user validation rules (password optional for updates)
 */
export const validateUpdateUser = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('role')
    .optional()
    .isIn(['Reviewer', 'Subject Expert', 'OrgAdmin'])
    .withMessage('Invalid role'),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Suspended'])
    .withMessage('Status must be Active, Inactive, or Suspended'),
  handleValidationErrors,
];

/**
 * Update platform user validation rules
 */
export const validateUpdatePlatformUser = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('role')
    .optional()
    .isIn(['Reviewer', 'Subject Expert', 'SuperAdmin'])
    .withMessage('Invalid role'),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Suspended'])
    .withMessage('Status must be Active, Inactive, or Suspended'),
  handleValidationErrors,
];

/**
 * Update org user (OrgAdmin) — Reviewer / Subject Expert only
 */
export const validateUpdateOrgUser = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('role')
    .optional()
    .isIn(['Reviewer', 'Subject Expert'])
    .withMessage('Role must be either "Reviewer" or "Subject Expert"'),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Suspended'])
    .withMessage('Status must be Active, Inactive, or Suspended'),
  handleValidationErrors,
];

/**
 * Create organization validation rules (for SuperAdmin)
 * Note: orgEmail is used for both organization and OrgAdmin email
 */
export const validateCreateOrganization = [
  body('orgName').trim().notEmpty().withMessage('Organization name is required'),
  body('orgEmail').trim().isEmail().withMessage('Valid organization email is required'),
  body('adminPassword')
    .isLength({ min: 8 })
    .withMessage('Admin password must be at least 8 characters'),
  body('adminFullName').trim().notEmpty().withMessage('Admin full name is required'),
  body('adminRole')
    .isIn(['OrgAdmin'])
    .withMessage('Admin role must be OrgAdmin'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Suspended'])
    .withMessage('Status must be Active, Inactive, or Suspended'),
  handleValidationErrors,
];

/**
 * Update organization validation rules
 */
export const validateUpdateOrganization = [
  body('orgName').optional().trim().notEmpty().withMessage('Organization name cannot be empty'),
  body('orgEmail').optional().trim().isEmail().withMessage('Valid organization email is required'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Suspended'])
    .withMessage('Status must be Active, Inactive, or Suspended'),
  handleValidationErrors,
];

