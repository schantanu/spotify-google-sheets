/**
 * @fileoverview UI components and interaction handlers for Spotify Playlist Manager
 * @see https://developers.google.com/apps-script/guides/dialogs
 *
 * Manages:
 * - Menu creation
 * - Sidebars and modals
 * - Error displays
 */

/**
 * Creates and shows HTML dialog
 * @param {Object} options Dialog configuration
 * @param {string} options.template Template file name
 * @param {string} options.title Dialog title
 * @param {boolean} [options.isSidebar=true] Show as sidebar vs modal
 * @param {Object} [options.size] Modal size {width, height}
 * @throws {Error} If dialog creation fails
 */
function showDialog({template, title, isSidebar = true, size = null}) {
  try {
    let html;
    if (template === 'error') {
      html = HtmlService.createHtmlOutputFromFile(template)
        .setWidth(400)
        .setHeight(180);
    } else {
      html = HtmlService.createTemplateFromFile(template)
        .evaluate()
        .setTitle(title);
    }

    if (isSidebar) {
      SpreadsheetApp.getUi().showSidebar(html);
    } else {
      if (size) html.setWidth(size.width).setHeight(size.height);
      SpreadsheetApp.getUi().showModalDialog(html, title);
    }
  } catch (error) {
    Logger.log(`Error showing dialog ${template}: ${error.stack}`);
  }
}

// Menu creation
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🎵 Spotify Playlists Manager')
      .addItem('ℹ️ User Guide', 'showUserGuide')
      .addItem('🛠️ Setup Guide', 'showSetupGuide')
      .addSeparator()
      .addItem('🎧 Playlists Manager', 'showPlaylistsManager')
      .addToUi();
  } catch (error) {
    Logger.log(`Error creating Menu: ${error.stack}`);
  }
}

/** Shows a sidebar with user guide */
function showUserGuide() {
  showDialog({
    template: 'user_guide',
    title: 'Spotify App User Guide'
  });
}

/** Shows a modal dialog with setup instructions */
function showSetupGuide() {
  showDialog({
    template: 'setup_guide',
    title: 'Spotify Playlists Manager Setup Guide',
    isSidebar: false,
    size: {width: 700, height: 860}
  });
}

/** Shows playlists management sidebar after auth check */
function showPlaylistsManager() {
  // Check if app is authenticated before proceeding
  try {
    const spotifyService = getSpotifyService();
    if (!spotifyService.hasAccess()) {
      showAuthError();
      return;
    }
  } catch (oauthError) {
    // If OAuth2 is not defined or there's any auth error, show auth error
    Logger.log(`OAuth error: ${oauthError.stack}`);
    showAuthError();
    return;
  }

  showDialog({
    template: 'playlists_manager',
    title: 'Spotify App Playlists Manager'
  });
}

/** Shows playlists import sidebar */
function showDownloadPlaylists() {
  showDialog({
    template: 'download_playlists',
    title: 'Spotify App Download Playlists'
  });
}

/** Shows playlist update sidebar */
function showUpdatePlaylists() {
  showDialog({
    template: 'update_playlists',
    title: 'Spotify App Update Playlists'
  });
}

/** Shows playlist create sidebar */
function showCreatePlaylists() {
  showDialog({
    template: 'create_playlists',
    title: 'Spotify App Create Playlists'
  });
}

/** Shows a modal dialog for auth error */
function showAuthError() {
  showDialog({
    template: 'error',
    title: 'Authorization Error',
    isSidebar: false,
    size: {width: 400, height: 180}
  });
}

/**
 * Shows modal dialog for general errors
 * @param {string} message - Error message to display
 */
function showError(message) {
  SpreadsheetApp.getUi().alert('Error', message, SpreadsheetApp.getUi().ButtonSet.OK);
}