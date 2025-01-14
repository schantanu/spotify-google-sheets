/**
 * @fileoverview Business logic operations for Spotify playlist management
 * @see https://developer.spotify.com/documentation/web-api/reference/playlists
 *
 * Key operations:
 * - Track operations (get, add, remove, reorder)
 * - Playlist management (create, update, search)
 * - Saved tracks handling
 * - Data sync between Spotify and Sheets
 *
 * Note: Uses makeSpotifyRequest() for all API calls and handles
 * chunking for batch operations within Spotify's rate limits
 */

/**
 * Gets user's saved tracks and optionally writes to sheet
 * @param {boolean} [writeToSheetFlag=false] - Whether to write data to sheet
 * @returns {Object} Object containing summary information
 * @throws {Error} If track fetching fails
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks Get user's saved tracks}
 */
function getSavedTracks(writeToSheetFlag = false) {
  try {
    const savedTracksId = CONFIG.api.savedTracksId;
    const savedTracksName = CONFIG.sheets.savedTracksName;
    const savedTracksDesc = CONFIG.sheets.savedTracksDesc;

    // Get user's saved tracks
    const tracksData = makeSpotifyRequest({
      endpoint: '/me/tracks',
      method: 'GET',
      limit: 50
    });

    if (!tracksData) {
      throw new Error('Failed to fetch saved tracks');
    }

    const totalTracks = tracksData.length;

    // Get user info for the summary
    const { displayName, profileUrl } = getUserInfo();

    // Create summary object matching playlist data structure
    const savedTracksInfo = {
      id: savedTracksId,
      owner: {
        display_name: displayName,
        type: 'user',
        external_urls: { spotify: profileUrl }
      },
      name: savedTracksName,
      description: savedTracksDesc,
      tracks: { total: totalTracks },
      public: false,
      collaborative: false,
      type: 'playlist',
      external_urls: {
        spotify: 'https://open.spotify.com/collection/tracks'
      }
    };

    // Logging
    Logger.log(`Getting ${totalTracks} total tracks from user's '${savedTracksName}'.`);

    // If true, write to sheet
    if (writeToSheetFlag) {
      const savedTracksSheet = savedTracksName;
      const headers = [
        ['Track ID', 'Name', 'Artists', 'Album', 'Release Date', 'Duration (ms)',
         'Track URL', 'External IDs', 'Type', 'Added At']
      ];
      const keys = [
        'track.id', 'track.name', 'track.artists.0.name', 'track.album.name',
        'track.album.release_date', 'track.duration_ms', 'track.external_urls.spotify',
        'track.external_ids', 'track.type', 'added_at'
      ];

      // Write data
      writeToSheet(savedTracksInfo.id, savedTracksInfo.owner.display_name, savedTracksSheet, savedTracksInfo.description, tracksData, headers, keys);

      // Logging
      Logger.log(`Successfully extracted user's '${savedTracksName}'.`);
    }

    return { summary: savedTracksInfo, tracksData };
  } catch (error) {
    Logger.log(`Error getting Saved Tracks:\n${error.stack}`);
    throw error;
  }
}

/**
 * Gets current user's playlists with saved tracks and writes them to the summary sheet
 * @throws {Error} If playlist fetching or writing fails
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists Get user's playlists}
 */
function getPlaylistsSummary() {
  try {
    const summarySheetName = CONFIG.sheets.summarySheetName;

    // Get user's saved tracks summary
    const { summary: savedTracksInfo } = getSavedTracks();
    const summaryData = [savedTracksInfo];

    // Fetch user's playlists data
    const response = makeSpotifyRequest({
      endpoint: '/me/playlists',
      method: 'GET',
      limit: 50
    });
    const playlistsData = response ? response : [];

    // Update summary with user's playlist data
    if (playlistsData?.length) {
      summaryData.push(...playlistsData);
    }

    // Write data to summary sheet
    const headers = [
      ['Playlist ID', 'Owner', 'Name', 'Description', 'Total Tracks',
      'Is Public?', 'Is Collaborative?', 'Type', 'Owner Type']
    ];
    const keys = [
      'id', 'owner.display_name', 'name', 'description', 'tracks.total',
      'public', 'collaborative', 'type', 'owner.type'
    ];

    // Write data to sheet
    writeSummarySheet(summaryData, headers, keys);

    // Format sheet
    formatSheet(summarySheetName);

    // Show toast message
    SpreadsheetApp.getActiveSpreadsheet()
      .toast(`Successfully extracted user's playlists summary in the '${summarySheetName}' sheet!`);
  } catch (error) {
    Logger.log(`Error getting Playlists Summary:\n${error.stack}`);
    throw error;
  }
}

/**
 * Retrieves playlist track IDs and optionally writes items to sheet
 * @param {string} playlistId - The ID of the playlist
 * @param {boolean} [writeToSheetFlag=false] - Whether to write data to sheet
 * @returns {Object} Playlist info and track IDs
 * @throws {Error} If fetching playlist items fails
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-playlists-tracks Get playlist items}
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-playlist Get Playlist}
 */
function getPlaylistItems(playlistId, writeToSheetFlag = false) {
  try {
    const savedTracksId = CONFIG.api.savedTracksId;

    // Handle saved tracks
    if (playlistId === savedTracksId) {
      return getSavedTracks(writeToSheetFlag);
    }

    // Get tracks data with pagination
    const tracksData = makeSpotifyRequest({
      endpoint: `/playlists/${playlistId}/tracks`,
      method: 'GET',
      limit: 50
    });

    if (!tracksData) {
      throw new Error('Failed to fetch playlist tracks');
    }

    // Extract track IDs
    const trackIds = tracksData
      .filter(item => item?.track?.id)
      .map(item => item.track.id);

    // Write to sheet if flag is true
    if (writeToSheetFlag) {

      // Get playlist metadata
      const playlistMetadata = makeSpotifyRequest({
        endpoint: `/playlists/${playlistId}`,
        method: 'GET'
      });

      if (!playlistMetadata) {
        throw new Error('Failed to fetch playlist metadata');
      }

      // Logging
      Logger.log(`Getting ${playlistMetadata.tracks.total} total tracks for '${playlistMetadata.name}' playlist.`);

      const headers = [
        ['Track ID', 'Name', 'Artists', 'Album', 'Release Date', 'Duration in ms',
        'Track URL', 'External IDs', 'Type', 'Added At', 'Added By']
      ];
      const keys = [
        'track.id', 'track.name', 'track.artists.0.name', 'track.album.name',
        'track.album.release_date', 'track.duration_ms', 'track.external_urls.spotify',
        'track.external_ids', 'track.type', 'added_at', 'added_by.external_urls.spotify'
      ];

      writeToSheet(
        playlistMetadata.id,
        playlistMetadata.owner?.display_name || '',
        playlistMetadata.name,
        playlistMetadata.description || '',
        tracksData,
        headers,
        keys
      );

      // Logging
      Logger.log(`Successfully extracted '${playlistMetadata.name}' playlist.`);
    }

    return trackIds;
  } catch (error) {
    Logger.log(`Error getting Playlist items:\n${error.stack}`);
    throw error;
  }
}

/**
 * Creates a new private playlist
 * @param {string} name - Playlist name (max 100 chars)
 * @param {string} description - Playlist description (max 300 chars)
 * @returns {Object} Created playlist data from Spotify API
 * @throws {Error} If playlist creation fails
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/create-playlist Create playlist}
 */
function createPlaylist(name, description) {
  try {
    // Get user info
    const { id: userId } = getUserInfo();

    // Create playlist via API
    const response = makeSpotifyRequest({
      endpoint: `/users/${userId}/playlists`,
      method: 'POST',
      data: {
        name: name.substring(0, 100),
        description: description?.substring(0, 300) || '',
        public: false
      }
    });

    // Logging
    Logger.log(`Created '${name}' playlist, with Playlist ID '${response.id}'.`);

    // Get Playlist items
    getPlaylistItems(response.id, true);

    return response;
  } catch (error) {
    Logger.log(`Error creating Playlist:\n${error.stack}`);
    throw error;
  }
}

/**
 * Searches Spotify for public playlists by query string or playlist ID
 * @param {string} query - Search text (or 'playlist_id:ABC123' format for direct lookup)
 * @returns {Array<PlaylistResult>} Formatted playlist results
 * @throws {Error} If API requests fail
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/search Search}
 */
function searchPublicPlaylists(query) {
  try {
    // Check if query is a playlist ID search
    const playlistIdMatch = query.match(/playlist_id:\s*(\w+)/i);

    if (playlistIdMatch) {
      // Extract playlist ID from the query
      const playlistId = playlistIdMatch[1];

      // Make direct request to get playlist by ID
      const playlist = makeSpotifyRequest({
        endpoint: `/playlists/${playlistId}`,
        method: 'GET'
      });

      // Return single playlist in expected format
      return [{
        item_id: playlist.id || '',
        name: playlist.name || 'Untitled Playlist',
        owner: playlist.owner?.display_name || 'Unknown Owner',
        total_tracks: `${playlist.tracks?.total || 0} songs`,
        description: playlist.description || '',
        image_url: playlist.images?.[0]?.url || '',
        owner_type: playlist.owner?.type || '',
        owner_url: playlist.owner?.external_urls?.spotify || '',
        spotify_url: playlist.external_urls?.spotify || '',
        is_public: true,
        is_collaborative: false
      }];
    }

    // If not a playlist ID search, proceed with normal search
    const encodedQuery = encodeURIComponent(query);
    const search = makeSpotifyRequest({
      endpoint: `/search?q=${encodedQuery}&type=playlist`,
      method: 'GET',
      limit: 50
    });

    // Return empty array if no results found
    if (!search?.playlists?.items) return [];

    // Transform and return playlist data
    return search.playlists.items
      .filter(Boolean)
      .map(playlist => ({
        item_id: playlist.id || '',
        name: playlist.name || 'Untitled Playlist',
        owner: playlist.owner?.display_name || 'Unknown Owner',
        total_tracks: `${playlist.tracks?.total || 0} songs`,
        description: playlist.description || '',
        image_url: playlist.images?.[0]?.url || '',
        owner_type: playlist.owner?.type || '',
        owner_url: playlist.owner?.external_urls?.spotify || '',
        spotify_url: playlist.external_urls?.spotify || '',
        is_public: true,
        is_collaborative: false
      }));
  } catch (error) {
    Logger.log(`Error searching public playlists:\n${error.stack}`);
    throw error;
  }
}

/**
 * Gets playlist information based on type with pagination support
 * @param {string} [type='user'] - Type of playlists ('user' or 'public')
 * @param {string} [searchQuery=''] - Search query for public playlists
 * @param {number} [offset=0] - Starting offset for pagination
 * @returns {Object} Playlists data with pagination info
 * @see {@link https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists Get user's playlists}
 */
function getPlaylistsInfo(type = 'user', searchQuery = '', offset = 0) {
  try {
    if (type === 'public') {
      return searchPublicPlaylists(searchQuery);
    }

    // Get saved tracks info
    const { summary: savedTracksInfo } = getSavedTracks();
    const uiSavedTracks = [{
      item_id: savedTracksInfo.id,
      name: savedTracksInfo.name,
      owner: savedTracksInfo.owner.display_name,
      total_tracks: `${savedTracksInfo.tracks.total} songs`,
      description: savedTracksInfo.description,
      image_url: '',
      owner_type: savedTracksInfo.owner.type,
      owner_url: savedTracksInfo.owner.external_urls.spotify,
      spotify_url: savedTracksInfo.external_urls.spotify,
      is_public: savedTracksInfo.public,
      is_collaborative: savedTracksInfo.collaborative
    }];

    // Get paginated user playlists
    const endpoint = `/me/playlists?offset=${offset}&limit=50`;
    const playlistsResponse = makeSpotifyRequest({
      endpoint,
      method: 'GET'
    });

    const playlistItems = playlistsResponse?.items?.map(item => ({
      item_id: item?.id || '',
      name: item?.name || 'Untitled Playlist',
      owner: item?.owner?.display_name || 'Unknown Owner',
      total_tracks: `${item?.tracks?.total || 0} songs`,
      description: item?.description || '',
      image_url: item?.images?.[0]?.url || '',
      owner_type: item?.owner?.type || '',
      owner_url: item?.owner?.external_urls?.spotify || '',
      spotify_url: item?.external_urls?.spotify || '',
      is_public: item?.public || false,
      is_collaborative: item?.collaborative || false
    })) || [];

    return {
      items: offset === 0 ? [...uiSavedTracks, ...playlistItems] : playlistItems,
      total: playlistsResponse?.total || 0,
      offset: offset,
      limit: 50
    };
  } catch (error) {
    Logger.log(`Error getting playlists info:\n${error.stack}`);
    throw error;
  }
}

/**
 * Gets playlists currently in Google sheets by ownership for dropdown
 * @param {boolean} [ownerOnly=true] - If true returns only user owned playlists, if false returns all playlists
 * @returns {Array<Object>} Array of playlist objects with id and name
 */
function getUserOwnedPlaylists(ownerOnly = true) {
  try {
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const sheetPlaylistIdCell = CONFIG.sheets.sheetPlaylistIdCell;
    const sheetPlaylistNameCell = CONFIG.sheets.sheetPlaylistNameCell;
    const sheetPlaylistOwnerCell = CONFIG.sheets.sheetPlaylistOwnerCell;

    const { displayName: currentUser } = getUserInfo();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const results = [];

    for (const sheet of sheets) {
      const sheetName = sheet.getName();

      // Skip summary sheet
      if (sheetName === summarySheetName) continue;

      // Get cell values with validation
      const playlistId = sheet.getRange(sheetPlaylistIdCell).getValue();
      const playlistName = sheet.getRange(sheetPlaylistNameCell).getValue();
      const owner = sheet.getRange(sheetPlaylistOwnerCell).getValue();

      // Skip if missing required values
      if (!playlistId || !playlistName || !owner) {
        Logger.log(`Skipping sheet "${sheetName}" - missing required metadata`);
        continue;
      }

      // Get owned playlists when true, others when false
      if (ownerOnly === (owner === currentUser)) {
        results.push({
          id: playlistId.toString().trim(),
          name: playlistName.toString().trim()
        });
      }
    }

    return results;
  } catch (error) {
    Logger.log(`Error with getting user owened playlists:\n${error.stack}`);
    throw error;
  }
}

/**
 * Tests if user has edit permissions for non-owned playlists
 * @param {string} playlistId - Spotify playlist ID
 * @returns {boolean} True if user can edit playlist
 */
function canEditPlaylist(playlistId) {
  try {
    const testTrackId = CONFIG.api.testTrackId;

    // Get current user id
    const currentUser = getUserInfo().id;

    // Get playlist info
    const playlistData = makeSpotifyRequest({
      endpoint: `/playlists/${playlistId}`,
      method: 'GET'
    });

    // Skip check if user owns playlist
    if (playlistData.owner.id === currentUser) {
      return true;
    }

    // Insert a test song to check if playlist is editable
    const testResponse = makeSpotifyRequest({
      endpoint: `/playlists/${playlistId}/tracks`,
      method: 'POST',
      data: {
        uris: [`spotify:track:${testTrackId}`],
        position: 0
      }
    });

    // Get playlist tracks to verify test track was added
    const playlistTracks = getPlaylistItems(playlistId);
    const testTrackAdded = playlistTracks[0] === testTrackId;

    if (testTrackAdded) {
      // Remove test track if it was successfully added
      makeSpotifyRequest({
        endpoint: `/playlists/${playlistId}/tracks`,
        method: 'DELETE',
        data: { tracks: [{uri: `spotify:track:${testTrackId}`}] }
      });
      return true;
    }

    return false;
  } catch (error) {
    Logger.log(`Error with checking public playlist permissions:\n${error.stack}`);
    return false;
  }
}

/**
 * Adds or removes tracks from a playlist or saved tracks library
 * @param {string} action - 'ADD' or 'DELETE'
 * @param {string} playlistId - Spotify playlist ID or savedTracksId
 * @param {Array<string>} tracks - Track IDs to add/remove
 * @param {number} [position] - Optional zero-based position for playlist insertion (ignored for saved tracks)
 */
function editPlaylistTracks(action, playlistId, tracks, position) {
  try {
    if (!tracks?.length) return;

    const isSavedTracks = playlistId === CONFIG.api.savedTracksId;
    const savedTracksChunkSize = CONFIG.api.savedTracksChunkSize;
    const savedTracksTimeSleep = CONFIG.api.savedTracksTimeSleep;
    const chunkSize = CONFIG.api.chunkSize;
    const timeSleep = CONFIG.api.timeSleep;

    // Handle saved tracks operations
    if (isSavedTracks) {
      const endpoint = '/me/tracks';

      if (action === 'ADD') {
        // Add tracks one by one to preserve order
        for (const trackId of [...tracks].reverse()) {
          makeSpotifyRequest({
            endpoint,
            method: 'PUT',
            data: { ids: [trackId] }
          });

          // Prevent saved tracks reordering
          Utilities.sleep(savedTracksTimeSleep);
        }
      } else {
        // Delete tracks in chunks
        for (let i = 0; i < tracks.length; i += savedTracksChunkSize) {
          makeSpotifyRequest({
            endpoint,
            method: 'DELETE',
            data: { ids: tracks.slice(i, i + savedTracksChunkSize) }
          });
          Utilities.sleep(savedTracksTimeSleep);
        }
      }
      return;
    }

    // Handle regular playlist operations
    const endpoint = `/playlists/${playlistId}/tracks`;
    for(let i = 0; i < tracks.length; i += chunkSize) {
      const chunk = tracks.slice(i, i + chunkSize);

      const data = action === 'ADD'
        ? { uris: chunk.map(id => `spotify:track:${id}`), position: typeof position === 'number' ? position + i : undefined }
        : { tracks: chunk.map(id => ({ uri: `spotify:track:${id}` })) };

      makeSpotifyRequest({
        endpoint,
        method: action === 'ADD' ? 'POST' : 'DELETE',
        data
      });
      Utilities.sleep(timeSleep);
    }

    return { success: true };
  } catch (error) {
    Logger.log(`Error with editing playlist tracks:\n${error.stack}`);
    throw error;
  }
}

/**
* Reorders tracks within a playlist handling duplicates efficiently
* @param {string} playlistId - Spotify playlist ID
* @param {Array<string>} tracksOrder - Desired track order
* @see {@link https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks Update playlist items}
*/
function reorderPlaylistTracks(playlistId, tracksOrder) {
  try {
    const timeSleep = CONFIG.api.timeSleep;
    const chunkSize = CONFIG.api.chunkSize;

    // Get current track positions including duplicates
    let currentPositions = getPlaylistItems(playlistId)
      .map((id, index) => ({ id, index }));

    // Find minimum moves needed for reordering
    const moves = [];
    let processedIndices = new Set();

    tracksOrder.forEach((trackId, targetIndex) => {
      if (processedIndices.has(targetIndex)) return;

      // Find first unprocessed occurrence of this track
      const currentPos = currentPositions.findIndex((pos, i) =>
        pos.id === trackId && !processedIndices.has(i)
      );

      if (currentPos !== targetIndex) {
        moves.push({
          range_start: currentPos,
          insert_before: targetIndex,
          range_length: 1
        });

        // Update tracking array
        const [movedTrack] = currentPositions.splice(currentPos, 1);
        currentPositions.splice(targetIndex, 0, movedTrack);
      }

      processedIndices.add(targetIndex);
    });

    // Execute moves in chunks
    for(let i = 0; i < moves.length; i += chunkSize) {
      const chunk = moves.slice(i, i + chunkSize);

      chunk.forEach(move => {
        makeSpotifyRequest({
          endpoint: `/playlists/${playlistId}/tracks`,
          method: 'PUT',
          data: move
        });
        Utilities.sleep(timeSleep);
      });
    }
  } catch (error) {
    Logger.log(`Error reordering playlist:\n${error.stack}`);
    throw error;
  }
}

/**
 * Compares track IDs between Spotify and sheet data to find differences
 * @param {string} operation - Operation type ('ADD' or 'DELETE')
 * @param {Object|Array<string>} spotifyData - Either array of track IDs or object containing tracksData array
 * @param {Array<string>} sheetTrackIds - Track IDs from the spreadsheet
 * @returns {Array<{id: string, position?: number}>} For ADD: objects with id and position. For DELETE: array of track IDs
 * @throws {Error} If invalid operation type provided
 */
function getTrackDifferences(operation, spotifyData, sheetTrackIds) {
 try {
   const spotifyTrackIds = Array.isArray(spotifyData) ?
     spotifyData :
     spotifyData.tracksData.map(item => item.track.id);

   if (operation === 'DELETE') {
     // Find tracks to remove
     const tracksToRemove = spotifyTrackIds.filter((id, i) => {
       const spotifyCount = spotifyTrackIds.slice(0, i + 1).filter(trackId => trackId === id).length;
       const sheetCount = sheetTrackIds.filter(trackId => trackId === id).length;
       return spotifyCount > sheetCount;
     });

     Logger.log(`Found ${tracksToRemove.length} tracks to remove`);
     return tracksToRemove;
   }

   // Find tracks to add
   const tracksToAdd = sheetTrackIds.map((id, i) => {
     const sheetCount = sheetTrackIds.slice(0, i + 1).filter(trackId => trackId === id).length;
     const spotifyCount = spotifyTrackIds.filter(trackId => trackId === id).length;
     return sheetCount > spotifyCount ? { id, position: i } : null;
   }).filter(Boolean);

   Logger.log(`Found ${tracksToAdd.length} tracks to add`);
   return tracksToAdd;
 } catch (error) {
   Logger.log(`Error with getting track differences:\n${error.stack}`);
   throw error;
 }
}

/**
 * Updates playlist or saved tracks to match sheet contents
 * @param {string} playlistId - Spotify playlist ID
 * @throws {Error} If sheet operations or API calls fail
 */
function updatePlaylist(playlistId) {
  try {
    const savedTracksId = CONFIG.api.savedTracksId;
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const dataHeaderRow = CONFIG.sheets.dataHeaderRow;
    const sheetPlaylistIdCell = CONFIG.sheets.sheetPlaylistIdCell;
    const spotifyTrackLimit = CONFIG.api.spotifyTrackLimit;
    const timeSleep = CONFIG.api.timeSleep;
    const chunkSize = CONFIG.api.chunkSize;

    // Check if playlist is saved tracks
    const isSavedTracks = playlistId === savedTracksId;

    // Check permissions
    if (playlistId !== savedTracksId && !canEditPlaylist(playlistId)) {
      return { code: 403, message: 'Insufficient permissions' };
    }

    // Get sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find(s =>
      s.getName() !== summarySheetName &&
      s.getRange(sheetPlaylistIdCell).getValue() === playlistId
    );
    const sheetName = sheet.getName();

    if (!sheet) throw new Error('Sheet not found for playlist');

    // Get sheet track IDs
    const lastRow = getColumnLastRow(sheetName, 1, dataHeaderRow) - 1;
    const numRows = lastRow - dataHeaderRow;
    let sheetTrackIds = [];

    // Track extraction with base62 validation
    if (numRows > 0) {
      const trackValues = sheet.getRange(dataHeaderRow + 1, 1, numRows, 1).getValues();
      const base62Pattern = /^[0-9A-Za-z]{22}$/;

      sheetTrackIds = trackValues
        .map(row => row[0]?.trim())
        .filter(id => id && base62Pattern.test(id));
    }

    // Handle Spotify track limit
    if (sheetTrackIds.length > spotifyTrackLimit) {
      const message = `Playlist exceeds ${spotifyTrackLimit} track limit. Processing first ${spotifyTrackLimit} tracks.`;
      SpreadsheetApp.getActiveSpreadsheet().toast(message, '⚠️ Warning');
      Logger.log(message);

      // Truncate to spotify track limit
      sheetTrackIds.length = spotifyTrackLimit;
    }

    // Logging
    Logger.log(`Updating ${sheetName} playlist.`)

    // Get current playlist state and get tracks to remove
    let spotifyTrackIds = getPlaylistItems(playlistId);
    const tracksToRemove = getTrackDifferences('DELETE', spotifyTrackIds, sheetTrackIds);

    // Remove tracks in chunks if needed
    if (tracksToRemove.length > 0) {
      for (let i = 0; i < tracksToRemove.length; i += chunkSize) {
        const chunk = tracksToRemove.slice(i, i + chunkSize);
        editPlaylistTracks('DELETE', playlistId, chunk);
        Utilities.sleep(timeSleep);
      }
    }

    // Get updated state after removals
    spotifyTrackIds = getPlaylistItems(playlistId);
    const tracksToAdd = getTrackDifferences('ADD', spotifyTrackIds, sheetTrackIds);

    // Add new tracks in chunks
    if (tracksToAdd.length > 0) {
      if (isSavedTracks) {
        // Send all tracks at once for saved tracks
        editPlaylistTracks('ADD', playlistId, tracksToAdd.map(track => track.id));
      } else {
        // Process in chunks for playlists
        for (let i = 0; i < tracksToAdd.length; i += chunkSize) {
          const chunk = tracksToAdd.slice(i, i + chunkSize).map(track => track.id);
          editPlaylistTracks('ADD', playlistId, chunk, tracksToAdd[i].position);
          Utilities.sleep(timeSleep);
        }
      }
    }

    // Reorder if needed (skip for saved tracks)
    if (!isSavedTracks) {
      // Get fresh state after any adds/removes
      const currentSpotifyTracks = getPlaylistItems(playlistId);
      Logger.log(`Current Spotify Tracks ${currentSpotifyTracks.length}`);

      // Only reorder if track order differs
      const currentOrder = currentSpotifyTracks.join(',');
      const desiredOrder = sheetTrackIds.join(',');

      if (currentOrder !== desiredOrder) {
        Logger.log('Track order differs - reordering needed');
        reorderPlaylistTracks(playlistId, sheetTrackIds);
      } else {
        Logger.log('Track order matches - no reordering needed');
      }
    }

    // Update playlist sheet
    getPlaylistItems(playlistId, true);

    return { code: 200, message: 'Success' };
  } catch (error) {
    Logger.log(`Error with updating playlist:\n${error.stack}`);
    throw error;
  }
}