/**
 * @fileoverview Config file containing constants and global settings for the Spotify Playlist Manager App
 * @see https://developer.spotify.com/documentation/web-api
 *
 * Core configurations:
 * - UI settings: Font, sizes, display options
 * - Sheet settings: Names, locations, cell references
 * - API settings: Base URL, default IDs, limits
 */

/**
 * User customizable settings for the app
 * @typedef {Object} UserConfig
 * @property {number} fontSize - Font size for sheets (8-14)
 * @property {string} defaultFont - Font family name
 * @property {boolean} hideMetadataRows - Whether to hide metadata rows
 * @property {string} summarySheetName - Name of Playlists Summary sheet
 * @property {string} savedTracksName - Display name for saved tracks
 * @property {string} savedTracksDesc - Description for saved tracks playlist
 */
const USER_CONFIG = {
  fontSize: 10,
  defaultFont: 'Inter',
  hideMetadataRows: false,
  summarySheetName: 'Playlists Summary',
  savedTracksName: 'Liked Songs',
  savedTracksDesc: 'Your saved tracks'
};

// Update CONFIG object to use USER_CONFIG
const CONFIG = {
  ui: {
    fontSize: USER_CONFIG.fontSize,
    defaultFont: USER_CONFIG.defaultFont,
    hideMetadataRows: USER_CONFIG.hideMetadataRows
  },
  sheets: {
    summarySheetName: USER_CONFIG.summarySheetName,
    savedTracksName: USER_CONFIG.savedTracksName,
    savedTracksDesc: USER_CONFIG.savedTracksDesc,
    dataHeaderRow: 6,
    sheetPlaylistIdCell: 'B1',
    sheetPlaylistOwnerCell: 'B2',
    sheetPlaylistNameCell: 'B3'
  },
  api: {
    baseUrl: 'https://api.spotify.com/v1',
    savedTracksId: 'saved_tracks',
    spotifyTrackLimit: 10000,
    chunkSize: 100,
    writeChunkSize: 1000,
    savedTracksChunkSize: 50,
    timeSleep: 100,
    savedTracksTimeSleep: 1000,
    testTrackId: '3BovdzfaX4jb5KFQwoPfAw'
  }
};