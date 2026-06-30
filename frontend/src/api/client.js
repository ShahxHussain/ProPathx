export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Make API request with error handling
 */
export async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, config);
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || `HTTP error! status: ${response.status}`);
    }

    if (!response.ok) {
      const error = new Error(data.error || `HTTP error! status: ${response.status}`);
      error.status = response.status;
      error.details = data.details || data;
      if (data.code) error.code = data.code;
      if (data.duplicate) error.duplicate = data.duplicate;
      // Include all error properties for detailed error display
      if (data.errorCode) error.errorCode = data.errorCode;
      if (data.hint) error.hint = data.hint;
      if (data.errorType) error.errorType = data.errorType;
      if (data.fullError) error.fullError = data.fullError;
      throw error;
    }

    return data;
  } catch (error) {
    // If it's already an Error with status/details, rethrow it
    if (error.status || error.details) {
      throw error;
    }
    // Otherwise wrap it
    const wrappedError = new Error(error.message || 'Network error');
    wrappedError.originalError = error;
    throw wrappedError;
  }
}
