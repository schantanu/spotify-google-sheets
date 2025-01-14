/**
 * @fileoverview Google Sheets operations for reading/writing Spotify playlist data
 * @see https://developers.google.com/apps-script/reference/spreadsheet
 *
 * Handles:
 * - Sheet creation and validation
 * - Data writing with formatting
 * - Filter and style management
 */

/**
 * Update the Font for the entire spreadsheet.
 * Note: Need to execute only once.
 */
function updateFont() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const defaultFont = CONFIG.ui.defaultFont;

    // Set default font
    ss.getSpreadsheetTheme().setFontFamily(defaultFont);
  } catch (error) {
    Logger.log(`Error updating default font:\n${error.stack}`);
    throw error;
  }
}

/**
 * Set the Font size for a given sheet.
 * @param {string} sheetName - The sheet to change the font size of
 * @parat {integer} fontSize - The font size for the whole sheet
 */
function setFontSize(sheetName, fontSize) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    // Set Font Size for whole sheet
    const range = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
    range.setFontSize(fontSize);
  } catch (error) {
    Logger.log(`Error setting sheet font size:\n${error.stack}`);
    throw error;
  }
}

/**
 * Activate a given cell in a sheet.
 * @param {string} sheetName - The sheet name.
 * @param {string} cell - The range in A1 notation, default = 'A1'
 */
function activateCell(sheetName, cell='A1') {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    // Activate cell
    sheet.getRange(cell).activate();
  } catch (error) {
    Logger.log(`Error activating sheet cell:\n${error.stack}`);
    throw error;
  }
}

/**
 * Get the last empty row in a column of a given sheet.
 * @param {string} role - The sheet name.
 * @param {integer} column - The column.
 * @param {integer} rowStart - The row from where the data starts.
 */
function getColumnLastRow(sheetName, column, rowStart) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    // Get range values
    const lastRow = sheet.getLastRow();
    const range = sheet.getRange(rowStart, column, lastRow);
    const values = range.getValues();

    // Reverse the array
    const reversedValues = values.reverse();

    // Find first non-empty cell from bottom of sheet (returns -1 if all cells empty)
    const offset = reversedValues.findIndex(c => c[0] !== '');
    if (offset === -1) {
      return rowStart - 1;
    }

    // Get column last row value
    const columnLastRow = ((lastRow + rowStart) - offset) ;

    return columnLastRow;
  } catch (error) {
    Logger.log(`Error getting column last row:\n${error.stack}`);
    throw error;
  }
}

/**
 * Toggles filter view on/off for a specified sheet
 * @param {string} sheetName - Name of the sheet to toggle filter on
 * @param {boolean} filterState - true to apply filter, false to remove filter
 * @returns {void}
 * @throws {Error} If sheet operations fail
 */
function toggleSheetFilter(sheetName, filterState) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const dataHeaderRow = CONFIG.sheets.dataHeaderRow;

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Remove existing filter if any
    const existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }

    // Add new filter if requested and sheet has headers
    if (filterState) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const headerRow = sheetName === summarySheetName ? 1 : dataHeaderRow;
      // const range = sheet.getRange(headerRow + ":" + headerRow);
      const dataRange = sheet.getRange(headerRow, 1, lastRow-(headerRow-1), lastCol);
      if (!dataRange.isBlank()) {
        const lastCol = dataRange.getLastColumn();
        dataRange.createFilter();
      }
    }
  } catch (error) {
    Logger.log(`Error setting filter:\n${error.stack}`);
    throw error;
  }
}

/**
 * Converts milliseconds to sortable duration format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Duration in format "@hh:mm:ss" where @ enables sorting
 */
function msToTime(ms) {
  try {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    // Prefix with @ to enable proper sorting while maintaining readable format
    return '@' + [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0')
    ].join(':');
  } catch (error) {
    Logger.log(`Error converting duration:\n${error.stack}`);
    throw error;
  }
}

/**
 * Validates and converts sheet name to meet Google Sheets requirements
 * @param {string} sheetName - Original sheet name to sanitize
 * @param {number} [maxLength=100] - Maximum allowed length
 * @returns {string} Sanitized sheet name
 */
function sanitizeSheetName(sheetName, maxLength = 100) {
  try {
    // Remove invalid characters and trim whitespace
    let sanitized = sheetName.replace(/[\\\/\?\*\[\]]/g, '').trim();

    // If name exceeds max length, truncate and add ellipsis
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength - 1) + '…';
    }

    return sanitized;
  } catch (error) {
    Logger.log(`Error sanitizing sheet name:\n${error.stack}`);
    throw error;
  }
}

/**
 * Checks if a sheet exists and handles creation/overwrite and naming
 * @param {string} playlistId - Playlist ID from Spotify
 * @param {string} playlistName - Name of the playlist
 * @returns {string} Sheet name
 * @throws {Error} If sheet operations fail
 */
function checkSheet(playlistId, playlistName) {
 try {
    const sheetNameMaxBaseLength = 93;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const sheetPlaylistIdCell = CONFIG.sheets.sheetPlaylistIdCell;

    // Special handling for summary sheet
    if (playlistId === summarySheetName) {
      let sheet = ss.getSheetByName(summarySheetName);
      if (!sheet) {
        sheet = ss.insertSheet(summarySheetName);
      } else {
        sheet.clear();
      }
      return summarySheetName;
    }

    if (!playlistId || !playlistName) {
      throw new Error('Playlist ID and name are required');
    }

    // Check existing sheets for matching playlist ID
    const sheets = ss.getSheets();
    for (const sheet of sheets) {
      const sheetPlaylistId = sheet.getRange(sheetPlaylistIdCell).getValue();
      if (sheetPlaylistId === playlistId) {
        // Clear existing content
        sheet.clear();

        // Update sheet name if different from current playlist name
        if (sheet.getName() !== playlistName) {
          let newSheetName = sanitizeSheetName(playlistName);
          let counter = 1;

          // Find available name using counter if needed
          while (ss.getSheetByName(newSheetName)) {
            const baseLength = playlistName.length > sheetNameMaxBaseLength ? sheetNameMaxBaseLength : playlistName.length;
            const counterStr = ` (${counter})`;
            newSheetName = sanitizeSheetName(playlistName, baseLength) + counterStr;
            counter++;
          }

          // Rename sheet to new name
          sheet.setName(newSheetName);
          Logger.log(`Sheet renamed from ${sheet.getName()} to ${newSheetName}`);
          return newSheetName;
        }

        return sheet.getName();
      }
    }

    // Create new sheet with counter if no match found
    let finalSheetName = sanitizeSheetName(playlistName);;
    let counter = 1;

    // Keep trying new names until we find an unused one
    while (true) {
      try {
        ss.insertSheet(finalSheetName);
        return finalSheetName;
      } catch (e) {
        // Sheet name exists, try next counter
        const baseLength = playlistName.length > sheetNameMaxBaseLength ? sheetNameMaxBaseLength : playlistName.length;
        const counterStr = ` (${counter})`;
        finalSheetName = sanitizeSheetName(playlistName, baseLength) + counterStr;
        counter++;
      }
    }
  } catch (error) {
    Logger.log(`Error while checking sheet:\n${error.stack}`);
    throw new Error(`Failed to process sheet for playlist "${playlistName}":\n${error.message}`);
  }
}

/**
 * Formats sheet styling
 * @param {string} sheetName - Name of the sheet to format
 * @throws {Error} If formatting operations fail
 */
function formatSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const savedTracksName = CONFIG.sheets.savedTracksName;
    const dataHeaderRow = CONFIG.sheets.dataHeaderRow;
    const fontSize = CONFIG.ui.fontSize;
    const hideMetadataRows = CONFIG.ui.hideMetadataRows;

    if (!sheet) {
      Logger.log(`Sheet with name '${sheetName}' does not exist.`);
      return;
    }

    const lastRow = Math.max(1, sheet.getLastRow());
    const lastColumn = Math.max(1, sheet.getLastColumn());
    const headerRow = sheetName === summarySheetName ? 1 : dataHeaderRow;

    // Common formatting
    const dataRange = sheet.getRange(headerRow, 1, lastRow, lastColumn);
    const headerRange = sheet.getRange(headerRow, 1, 1, lastColumn);

    // Set wrap strategy
    dataRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

    // Header row styling
    headerRange.setBackgroundColor('#cfe2f3').setFontWeight('bold');

    // Freeze header row
    sheet.setFrozenRows(headerRow);

    // Ensures all previous changes are applied
    SpreadsheetApp.flush();

    // Sheet-specific formatting
    if (sheetName === summarySheetName) {
      // Set sheet font size before auto resizing columns
      setFontSize(sheetName, fontSize + 1);

      // Auto-resize columns
      sheet.autoResizeColumns(1, 9);

      // Set fixed width for Name and Description
      sheet.setColumnWidth(3, 300);
      sheet.setColumnWidth(4, 300);

      // Set custom font size
      setFontSize(sheetName, fontSize);

      // Set sheet tab color
      sheet.setTabColor('6aa84f');
    } else {
      if (sheetName === savedTracksName) {
        // Set sheet tab color
        sheet.setTabColor('#3c78d8');
      }

      // For other sheets, set fixed widths
      const columnWidths = [220, 200, 200, 200, 110, 110, 110, 150, 50, 155, 110];
      columnWidths.forEach((width, i) => sheet.setColumnWidth(i + 1, width));

      // Hide playlist metadata rows
      if (hideMetadataRows) {
        sheet.hideRows(1, headerRow - 1);
      }
    }

    // Arrange sheet order
    const sheets = ss.getSheets();
    const numSheets = sheets.length;

    if (sheetName === summarySheetName) {
      // Move Summary sheet to first position
      if (numSheets > 1) {
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(1);
      }
    } else if (sheetName === savedTracksName) {
      if (numSheets > 1) {
        ss.setActiveSheet(sheet);
        const summaryIndex = sheets.findIndex(s => s.getName() === summarySheetName);
        const newPosition = summaryIndex >= 0 ? summaryIndex + 2 : 2;
        if (newPosition <= numSheets) {
          ss.moveActiveSheet(newPosition);
        }
      }
    } else {
      if (numSheets > 1) {
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(numSheets);
      }
    }

    // Apply filter to sheet
    toggleSheetFilter(sheetName, true);

    // Activate sheet
    activateCell(sheetName);
  } catch (error) {
    Logger.log(`Error formatting sheet '${sheetName}':\n${error.stack}`);
    throw error;
  }
}

/**
 * Writes playlist track data to a dedicated sheet
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} playlistOwner - Display name of playlist owner
 * @param {string} playlistName - Name of the playlist
 * @param {string} playlistDescription - Description of the playlist
 * @param {Object[]} data - Array of track objects from Spotify API
 * @param {string[][]} headers - 2D array containing column header names
 * @param {string[]} keys - Array of dot-notation paths to extract values from track objects
 * @throws {Error} If writing to sheet fails
 */
function writeToSheet(playlistId, playlistOwner, playlistName, playlistDescription, data, headers, keys) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const savedTracksId = CONFIG.api.savedTracksId;
    const dataHeaderRow = CONFIG.sheets.dataHeaderRow;
    const sheetPlaylistNameCell = CONFIG.sheets.sheetPlaylistNameCell;
    const writeChunkSize = CONFIG.api.writeChunkSize;

    // Validate sheet
    const sheetName = checkSheet(playlistId, playlistName);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) return;

    // Remove filters
    toggleSheetFilter(sheetName, false);

    // Write metadata
    sheet.getRange('A1:B4').setValues([
      ['Playlist ID', playlistId || ''],
      ['Playlist Owner', playlistOwner || ''],
      ['Playlist Name', playlistName || ''],
      ['Playlist Description', '']
    ]);

    // Add hyperlink to playlist ID cell
    const playlistUrl = playlistId === savedTracksId
      ? 'https://open.spotify.com/collection/tracks'
      : `https://open.spotify.com/playlist/${playlistId}`;

    sheet.getRange(sheetPlaylistNameCell).setRichTextValue(
      SpreadsheetApp.newRichTextValue()
        .setText(playlistName)
        .setLinkUrl(playlistUrl)
        .build()
    );

    // Update Playlist Description with hyperlinks, if available
    const linkRegex = /<a\s+href="([^"]+)">([^<]+)<\/a>/g;
    const plainText = playlistDescription.replace(/<a\s+href="[^"]+">|<\/a>/g, '');
    const descriptionCell = SpreadsheetApp.newRichTextValue().setText(plainText);

    // Find and map all links
    let match;
    let lastIndex = 0;
    while ((match = linkRegex.exec(playlistDescription)) !== null) {
      const url = match[1];
      const text = match[2];
      const startPos = plainText.indexOf(text, lastIndex);
      lastIndex = startPos + text.length;
      descriptionCell.setLinkUrl(startPos, startPos + text.length, url);
    }
    sheet.getRange('B4').setRichTextValue(descriptionCell.build());

    // Logging
    Logger.log(`Writing '${playlistName}' playlist to '${sheetName}' sheet.`);

    // Write headers and data
    sheet.getRange(dataHeaderRow, 1, 1, headers[0].length).setValues(headers);

    // Transform all data at once
    const transformedData = data.map(row =>
      keys.map(key => {
        const value = key.split('.').reduce((acc, part) =>
          (acc && acc[part] !== undefined ? acc[part] : ""), row);
        return key === 'track.duration_ms' ? msToTime(value) : value;
      })
    );

    // Write data in chunks
    for (let i = 0; i < transformedData.length; i += writeChunkSize) {
      const chunk = transformedData.slice(i, i + writeChunkSize);
      sheet.getRange(
        dataHeaderRow + 1 + i,
        1,
        chunk.length,
        chunk[0].length
      ).setValues(chunk);

      // Add small delay between chunks
      if (i + writeChunkSize < transformedData.length) {
        Utilities.sleep(50);
      }
    }

    // Format sheet
    formatSheet(sheetName);
  } catch (error) {
    Logger.log(`Error writing playlist to sheet:\n${error.stack}`);
    throw error;
  }
}

/**
 * Writes playlist summary data to the summary sheet with hyperlinks
 * @param {Object[]} data - Array of playlist objects containing metadata
 * @param {string[][]} headers - 2D array containing column header names
 * @param {string[]} keys - Array of dot-notation paths to extract values from data objects
 * @throws {Error} If writing to sheet fails
 */
function writeSummarySheet(data, headers, keys) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summarySheetName = CONFIG.sheets.summarySheetName;
    const savedTracksName = CONFIG.sheets.savedTracksName;

    // Check sheet
    const sheetName = checkSheet(summarySheetName, null);
    const sheet = ss.getSheetByName(sheetName);

    // Remove filters
    toggleSheetFilter(summarySheetName, false);

    // Logging
    Logger.log(`Writing '${savedTracksName}' to '${sheetName}' sheet.`);

    // Write headers
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);

    // Write data and hyperlinks
    data.forEach((row, i) => {
      const rowData = keys.map(key =>
        key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ""), row)
      );

      // Write row data
      sheet.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);

      // Add hyperlinks
      const ownerUrl = row?.owner?.external_urls?.spotify;
      const playlistUrl = row?.external_urls?.spotify;
      const ownerIndex = keys.findIndex(k => k === 'owner.display_name');
      const nameIndex = keys.findIndex(k => k === 'name');

      if (ownerIndex !== -1 && ownerUrl) {
        sheet.getRange(i + 2, ownerIndex + 1).setRichTextValue(
          SpreadsheetApp.newRichTextValue()
            .setText(rowData[ownerIndex])
            .setLinkUrl(ownerUrl)
            .build()
        );
      }

      if (nameIndex !== -1 && playlistUrl) {
        sheet.getRange(i + 2, nameIndex + 1).setRichTextValue(
          SpreadsheetApp.newRichTextValue()
            .setText(rowData[nameIndex])
            .setLinkUrl(playlistUrl)
            .build()
        );
      }
    });

    // Format sheet
    formatSheet(summarySheetName);
  } catch (error) {
    Logger.log(`Error writing playlists summary data to sheet:\n${error.stack}`);
    throw error;
  }
}