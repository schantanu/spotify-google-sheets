/**
 * @fileoverview Core Spotify API functionality, authentication and data fetching
 * @see https://developer.spotify.com/documentation/web-api/concepts/api-calls
 *
 * Contains functions for:
 * - Authentication and OAuth2 flow
 * - API requests with rate limiting and pagination
 * - Credential management
 */

/**
 * Creates a Spotify OAuth2 service
 * @returns {OAuth2.Service} The Spotify OAuth2 service
 * @see {@link https://developer.spotify.com/documentation/web-api/concepts/scopes API scopes}
 */
function getSpotifyService() {
  try {
    return OAuth2.createService('Spotify')
      .setAuthorizationBaseUrl('https://accounts.spotify.com/authorize')
      .setTokenUrl('https://accounts.spotify.com/api/token')
      .setClientId(PropertiesService.getScriptProperties().getProperty('CLIENT_ID'))
      .setClientSecret(PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET'))
      .setCallbackFunction('authCallback')
      .setPropertyStore(PropertiesService.getUserProperties())
      .setScope('user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private');
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Callback function for handling the OAuth2 authorization flow
 * @param {Object} request - The request object containing the authorization code
 * @returns {HtmlOutput} HTML output indicating the authorization result
 */
function authCallback(request) {
  try {
    const spotifyService = getSpotifyService();
    const isAuthorized = spotifyService.handleCallback(request);

    // HTML template
    const createHtmlOutput = (message) => `
      <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', sans-serif; margin: 0; display: flex; justify-content: center; margin-top: 200px; height: 100vh; background-color: #f4f4f9; color: #333; }
            h2 { text-align: center; }
          </style>
        </head>
        <body>
          <h2>${message}</h2>
        </body>
      </html>
    `;

    // Set default font after authentication
    updateFont();

    return HtmlService.createHtmlOutput(
      createHtmlOutput(isAuthorized ? 'Authorization Successful! You can now close this tab.' : 'Authorization Denied! Please close this tab and follow the Setup Guide steps again.')
    );
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Sets credentials using the provided client ID and secret
 * @param {string} clientId - The client ID
 * @param {string} clientSecret - The client secret
 */
function setCredentials(clientId, clientSecret) {
  try {
    if (clientId && clientSecret) {
      PropertiesService.getScriptProperties().setProperties({
        CLIENT_ID: clientId,
        CLIENT_SECRET: clientSecret
      });
    }
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Retrieves the stored secrets (client ID, client secret, redirect URI)
 * @returns {Object} Object containing the secrets
 */
function getSecrets() {
  try {
    // Get saved Script Properties
    const scriptProperties = PropertiesService.getScriptProperties();
    const { CLIENT_ID: clientId, CLIENT_SECRET: clientSecret } = scriptProperties.getProperties();
    const redirectUri = `https://script.google.com/macros/d/${ScriptApp.getScriptId()}/usercallback`;

    return { clientId, clientSecret, redirectUri };
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Gets the script editor URL
 * @returns {string} The script editor URL
 */
function getEditorURL() {
  try {
    return `https://script.google.com/home/projects/${ScriptApp.getScriptId()}/edit`;
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Gets the authorization URL for the Spotify service
 * @returns {string} The authorization URL
 */
function getAuthorizationURL() {
  try {
    return getSpotifyService().getAuthorizationUrl();
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Gets current user's Spotify profile information
 * @returns {Object} User profile containing id, display name and profile URL
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile Spotify API Current User's Profile}
 */
function getUserInfo() {
  try {
    // Make API request to get user profile
    const response = makeSpotifyRequest({
      endpoint: '/me',
      method: 'GET'
    });

    // If no response data, return empty user info
    if (!response) {
      return { id: '', displayName: '', profileUrl: '' };
    }

    // Extract and return required fields
    return {
      id: response.id || '',
      displayName: response.display_name || '',
      profileUrl: response.external_urls?.spotify || ''
    };
  } catch (error) {
    Logger.log(`Error fetching user info:\n${error.stack}`);
    return { id: '', displayName: '', profileUrl: '' };
  }
}

/**
 * Makes requests to Spotify API with auth, pagination, and error handling
 * @param {Object} options Request configuration
 * @param {string} options.endpoint API endpoint path
 * @param {string} [options.method='GET'] HTTP method
 * @param {Object} [options.data] Request payload
 * @param {number} [options.limit=0] Items per page (0 for non-paginated)
 * @returns {Object|Array} API response data
 * @throws {Error} If API request fails
 */
function makeSpotifyRequest({endpoint, method = 'GET', data = null, limit = 0}) {
  try {
    const baseUrl = CONFIG.api.baseUrl;

    // Validate auth and get token
    const spotifyService = getSpotifyService();
    if (!spotifyService.hasAccess()) {
      Logger.log('Auth required');
      showAuthError();
      return null;
    }

    // Setup base request options
    const baseOptions = {
      headers: {
        'Authorization': `Bearer ${spotifyService.getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      method,
      muteHttpExceptions: true
    };

    // Add payload for write operations
    if (data) {
      baseOptions.payload = JSON.stringify(data);
    }

    // Handle non-paginated requests
    if (limit === 0) {
      const response = UrlFetchApp.fetch(`${baseUrl}${endpoint}`, baseOptions);
      return handleResponse(response);
    }

    // Handle search endpoint specially
    if (endpoint.includes('/search')) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const response = UrlFetchApp.fetch(
        `${baseUrl}${endpoint}${separator}limit=${limit}`,
        baseOptions
      );
      return handleResponse(response);
    }

    // Handle paginated requests
    return getPaginatedData(endpoint, baseOptions, limit);
  } catch (error) {
    Logger.log(error.stack);
    return null;
  }
}

/**
 * Handles response from Spotify API and logs failures
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - The HTTP response object
 * @returns {Object} Parsed JSON response data
 * @throws {Error} If response parsing fails
 */
function handleResponse(response) {
  try {
    const responseCode = response.getResponseCode();

    if (responseCode === 429) {
      Logger.log('Rate limit exceeded');
      showError('API Rate limit exceeded. Please wait a few minutes before trying again.');
      throw new Error('Rate limit exceeded');
    }

    // Log response details for failures
    if (responseCode !== 200 && responseCode !== 201) {
      Logger.log(`Response code: ${response}\nContent: ${response.getContentText()}`);
    }

    // Get content text
    const contentText = response.getContentText();

    // Return null for empty responses (common for PUT/DELETE)
    return contentText ? JSON.parse(contentText) : null;
  } catch (error) {
    Logger.log(error.stack);
  }
}

/**
 * Handles paginated requests to Spotify API
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Request configuration options
 * @param {number} limit - Number of items per page
 * @returns {Array} Combined array of paginated response items
 * @throws {Error} If pagination request fails
 */
function getPaginatedData(endpoint, options, limit) {
  try {
    const baseUrl = CONFIG.api.baseUrl;
    let items = [];
    let offset = 0;

    while (true) {
      const url = endpoint.includes('?')
        ? `${baseUrl}${endpoint}&limit=${limit}&offset=${offset}`
        : `${baseUrl}${endpoint}?limit=${limit}&offset=${offset}`;

      const response = UrlFetchApp.fetch(url, options);
      const responseData = handleResponse(response);

      if (!responseData?.items?.length) break;
      items = items.concat(responseData.items);
      offset += limit;
    }

    return items;
  } catch (error) {
    Logger.log(error.stack);
    if (error.message.includes('Rate limit exceeded')) {
      throw error;
    }
    return null;
  }
}