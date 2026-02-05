const API_BASE_URL = 'http://localhost:4000'; // Backend runs on 4000

export const authenticatedFetch = async (url, options = {}) => {
  const { getToken, user } = window.Clerk || {};

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (getToken) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Pass user id to scope data per user (handled server-side)
  if (user?.id) {
    headers['x-user-id'] = user.id;
  }

  const primaryEmail = user?.primaryEmailAddress?.emailAddress;
  if (primaryEmail) {
    headers['x-user-email'] = primaryEmail.toLowerCase();
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `API Error: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMsg = errorData.error;
      }
    } catch (e) {
      // If response is not JSON, use statusText
    }
    const error = new Error(errorMsg);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

// Helper for GET requests
export const apiGet = (url) => authenticatedFetch(url, { method: 'GET' });

// Helper for POST requests
export const apiPost = (url, body) => authenticatedFetch(url, {
  method: 'POST',
  body: JSON.stringify(body),
});
