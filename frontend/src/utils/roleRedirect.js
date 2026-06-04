/**
 * Get dashboard route based on user role
 * @param {string} role - User role
 * @returns {string} Dashboard route
 */
export const getDashboardRoute = (role) => {
  const routes = {
    OrgAdmin: '/org/dashboard',
    Reviewer: '/reviewer/dashboard',
    'Subject Expert': '/expert/dashboard',
  };

  return routes[role] || '/dashboard';
};

/**
 * Route after org-side login (or first-password completion)
 * @param {{ role?: string, mustChangePassword?: boolean }} user
 */
export const getPostLoginRoute = (user) => {
  if (user?.mustChangePassword) {
    return '/welcome';
  }
  return getDashboardRoute(user?.role);
};



