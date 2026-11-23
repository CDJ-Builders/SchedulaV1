/** Client-side Excel template and weekly schedule import. */
(function () {
  const HEADERS = [
    'Event Title',
    'Event Weekday',
    'Event Modality',
    'Event Start Time',
    'Event End Time',
    'Event Description'
  ];
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MODALITIES = ['onsite', 'online'];
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function workbookLibrary() {
    return window.ExcelJS;
  }

  function textValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
      if (Object.prototype.hasOwnProperty.call(value, 'result')) return textValue(value.result);
      if (typeof value.text === 'string') return value.text;
      return '';
    }
    return String(value);
  }

  function parseTimeCell(cell) {
    let value = cell.value;
    if (value && typeof value === 'object' && !(value instanceof Date)
      && Object.prototype.hasOwnProperty.call(value, 'result')) {
      value = value.result;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      const minutes = Math.min(1439, Math.round((value - Math.floor(value)) * 1440));
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }

    const text = textValue(value).trim();
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
  }

  function cellIsEmpty(cell) {
    return textValue(cell.value).trim() === '';
  }

  function validateRow(row, rowNumber) {
    const errors = [];
    const title = textValue(row.getCell(1).value).trim();
    const weekdayText = textValue(row.getCell(2).value).trim().toLowerCase();
    const modalityText = textValue(row.getCell(3).value).trim().toLowerCase();
    const weekday = WEEKDAYS.find(day => day.toLowerCase() === weekdayText);
    const modality = MODALITIES.includes(modalityText) ? modalityText : '';
    const startTime = parseTimeCell(row.getCell(4));
    const endTime = parseTimeCell(row.getCell(5));
    const description = textValue(row.getCell(6).value).trim();

    if (!title) errors.push('event title is required');
    if (!weekday) errors.push('weekday must be Monday through Sunday');
    if (!modality) errors.push('modality must be onsite or online');
    if (!startTime) errors.push('start time must be a valid HH:MM time');
    if (!endTime) errors.push('end time must be a valid HH:MM time');
    if (startTime && endTime && endTime <= startTime) errors.push('end time must be later than start time');

    if (errors.length) return { rowNumber, errors };
    return {
      rowNumber,
      event: {
        title,
        weekdays: [weekday],
        modality,
        start_time: startTime,
        end_time: endTime,
        description
      }
    };
  }

  function timeRangesOverlap(first, second) {
    return first.start_time < second.end_time && first.end_time > second.start_time;
  }

  function filterConflicts(validRows, existingEvents = []) {
    const accepted = [];
    const skipped = [];
    const conflicts = [...existingEvents];

    validRows.forEach(item => {
      const event = item.event;
      const conflictingEvent = conflicts.find(existing =>
        event.weekdays.some(day => existing.weekdays?.includes(day))
        && timeRangesOverlap(event, existing)
      );

      if (conflictingEvent) {
        const day = event.weekdays.find(weekday => conflictingEvent.weekdays?.includes(weekday));
        const source = conflictingEvent.rowNumber
          ? `another imported row (${conflictingEvent.rowNumber})`
          : `existing event "${conflictingEvent.title}"`;
        skipped.push({
          rowNumber: item.rowNumber,
          errors: [`overlaps ${source} on ${day}`]
        });
        return;
      }

      accepted.push(item);
      conflicts.push({ ...event, rowNumber: item.rowNumber });
    });

    return { valid: accepted, skipped };
  }

  async function downloadTemplate() {
    const ExcelJS = workbookLibrary();
    if (!ExcelJS) throw new Error('Excel support did not load. Refresh the page and try again.');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Events', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { width: 26 },
      { width: 20 },
      { width: 20 },
      { width: 20, style: { numFmt: '@' } },
      { width: 20, style: { numFmt: '@' } },
      { width: 38 }
    ];
    sheet.addRow(HEADERS);
    sheet.addRow([
      'Team planning',
      'Monday',
      'onsite',
      '13:30',
      '14:30',
      'Weekly planning session'
    ]);

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A1D6D' } };
    sheet.getCell('D2').numFmt = '@';
    sheet.getCell('E2').numFmt = '@';
    sheet.dataValidations.add('B2:B1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${WEEKDAYS.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid weekday',
      error: 'Choose a weekday from the dropdown.'
    });
    sheet.dataValidations.add('C2:C1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${MODALITIES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid modality',
      error: 'Choose onsite or online from the dropdown.'
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_TYPE }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schedula-upload-template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function parseWorkbook(file) {
    const ExcelJS = workbookLibrary();
    if (!ExcelJS) throw new Error('Excel support did not load. Refresh the page and try again.');
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file.');
    if (!file.size) throw new Error('The selected Excel file is empty.');

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new Error('The selected file is not a readable .xlsx workbook.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('The workbook has no worksheet.');

    const headerRow = sheet.getRow(1);
    const headers = HEADERS.map((_, index) => textValue(headerRow.getCell(index + 1).value));
    let hasExtraHeader = false;
    for (let column = HEADERS.length + 1; column <= headerRow.cellCount; column += 1) {
      if (!cellIsEmpty(headerRow.getCell(column))) hasExtraHeader = true;
    }
    if (hasExtraHeader || headers.some((header, index) => header !== HEADERS[index])) {
      throw new Error(`The first row must contain these six headers, in order: ${HEADERS.join(' | ')}.`);
    }

    const populatedRows = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, cell => {
        if (!cellIsEmpty(cell)) hasValue = true;
      });
      if (hasValue) populatedRows.push({ row, rowNumber });
    }
    if (!populatedRows.length) throw new Error('The worksheet has no event rows. Add at least one event below the headers.');

    const valid = [];
    const skipped = [];
    populatedRows.forEach(({ row, rowNumber }) => {
      const result = validateRow(row, rowNumber);
      let hasExtraCell = false;
      for (let column = HEADERS.length + 1; column <= row.cellCount; column += 1) {
        if (!cellIsEmpty(row.getCell(column))) hasExtraCell = true;
      }
      if (hasExtraCell) result.errors = [...(result.errors || []), 'only six event columns are allowed'];

      if (result.errors?.length) skipped.push(result);
      else valid.push(result);
    });
    return { valid, skipped };
  }

  function open(options = {}) {
    const showSkip = options.showSkip === true;
    const onClose = typeof options.onClose === 'function' ? options.onClose : () => { };
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay schedule-excel-overlay';
    overlay.innerHTML = `
      <section class="custom-modal schedule-excel-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-excel-title" aria-describedby="schedule-excel-description">
        <header class="schedule-excel-heading">
          <div>
            <h2 id="schedule-excel-title">Import Schedule as Excel</h2>
            <p id="schedule-excel-description">Download the template to import weekly events from an .xlsx workbook.</p>
          </div>
          <button class="schedule-excel-close" type="button" aria-label="Close">&times;</button>
        </header>
        <button class="custom-modal-btn secondary schedule-excel-template" type="button">Download template</button>
        <label class="schedule-excel-dropzone" for="schedule-excel-file">
          <strong>Drop the .xlsx template here</strong>
          <span class="schedule-excel-filename">Only .xlsx workbooks are supported.</span>
          <input id="schedule-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        </label>
        <p class="schedule-excel-status" role="status" aria-live="polite">Upload a workbook to begin.</p>
        <section class="schedule-excel-summary" hidden aria-label="Import results">
          <h3 class="schedule-excel-summary-count"></h3>
          <ul class="schedule-excel-issues"></ul>
        </section>
        <div class="custom-modal-actions schedule-excel-actions">
          <button class="custom-modal-btn secondary" type="button" data-close>${showSkip ? 'Skip' : 'Cancel'}</button>
          <button class="custom-modal-btn primary" type="button" data-upload disabled>Upload</button>
          <button class="custom-modal-btn success schedule-excel-continue" type="button" data-continue hidden>Continue</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const closeButton = overlay.querySelector('.schedule-excel-close');
    const cancelButton = overlay.querySelector('[data-close]');
    const continueButton = overlay.querySelector('[data-continue]');
    const templateButton = overlay.querySelector('.schedule-excel-template');
    const fileInput = overlay.querySelector('#schedule-excel-file');
    const fileName = overlay.querySelector('.schedule-excel-filename');
    const uploadButton = overlay.querySelector('[data-upload]');
    const status = overlay.querySelector('.schedule-excel-status');
    const summary = overlay.querySelector('.schedule-excel-summary');
    const summaryCount = overlay.querySelector('.schedule-excel-summary-count');
    const issuesList = overlay.querySelector('.schedule-excel-issues');
    let selectedFile = null;
    let isClosed = false;
    let isBusy = false;

    function close() {
      if (isClosed || isBusy) return;
      isClosed = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      onClose();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close();
    }

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    }

    function showSummary(imported, skipped) {
      summary.hidden = false;
      summaryCount.textContent = `${imported} imported, ${skipped.length} skipped.`;
      issuesList.replaceChildren();
      skipped.forEach(item => {
        const entry = document.createElement('li');
        entry.textContent = `Row ${item.rowNumber}: ${item.errors.join('; ')}`;
        issuesList.appendChild(entry);
      });
    }

    function showSuccessPopup(imported) {
      const successOverlay = document.createElement('div');
      successOverlay.className = 'custom-modal-overlay active schedule-excel-success-overlay';
      successOverlay.innerHTML = `
        <section class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-excel-success-title">
          <div class="custom-modal-icon success" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:24px;height:24px">
              <path stroke-linecap="round" stroke-linejoin="round" d="m5 12 4 4L19 6" />
            </svg>
          </div>
          <h2 class="custom-modal-title success-text" id="schedule-excel-success-title">Import successful</h2>
          <p class="custom-modal-body">${imported} ${imported === 1 ? 'row was' : 'rows were'} imported successfully.</p>
          <div class="custom-modal-actions">
            <button class="custom-modal-btn success" type="button">Close</button>
          </div>
        </section>`;
      document.body.appendChild(successOverlay);

      const close = () => {
        successOverlay.remove();
        uploadButton.focus();
      };
      successOverlay.querySelector('button').addEventListener('click', close);
      successOverlay.addEventListener('click', event => {
        if (event.target === successOverlay) close();
      });
      successOverlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      });
      successOverlay.querySelector('button').focus();
    }

    function setSelectedFile(file) {
      selectedFile = file || null;
      fileName.textContent = selectedFile ? selectedFile.name : 'Only .xlsx workbooks are supported.';
      uploadButton.disabled = !selectedFile;
      summary.hidden = true;
      setStatus(selectedFile ? 'Ready to validate the workbook.' : 'Choose a workbook to begin.');
    }

    closeButton.addEventListener('click', close);
    cancelButton.addEventListener('click', close);
    continueButton.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKeyDown);
    templateButton.addEventListener('click', async () => {
      templateButton.disabled = true;
      try {
        await downloadTemplate();
        setStatus('The Excel template has been downloaded.');
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        templateButton.disabled = false;
      }
    });

    fileInput.addEventListener('change', () => setSelectedFile(fileInput.files[0]));
    const dropzone = overlay.querySelector('.schedule-excel-dropzone');
    dropzone.addEventListener('dragover', event => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
    dropzone.addEventListener('dragleave', event => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging');
    });
    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
      setSelectedFile(event.dataTransfer.files[0]);
    });

    uploadButton.addEventListener('click', async () => {
      if (!selectedFile || isBusy) return;
      if (!/\.xlsx$/i.test(selectedFile.name)) {
        setStatus('Choose an .xlsx file. Other file types are not accepted.', true);
        return;
      }

      isBusy = true;
      uploadButton.disabled = true;
      cancelButton.disabled = true;
      closeButton.disabled = true;
      templateButton.disabled = true;
      setStatus('Reading and validating the workbook…');
      try {
        const parsed = await parseWorkbook(selectedFile);
        const existingEvents = typeof options.getExistingEvents === 'function'
          ? options.getExistingEvents()
          : [];
        const conflicts = filterConflicts(parsed.valid, existingEvents);
        const result = {
          valid: conflicts.valid,
          skipped: parsed.skipped.concat(conflicts.skipped)
        };
        let imported = 0;
        let skipped = result.skipped;
        if (result.valid.length) {
          try {
            if (typeof options.onImport !== 'function') throw new Error('Schedule import is unavailable on this page.');
            await options.onImport(result.valid.map(item => item.event));
            imported = result.valid.length;
          } catch (error) {
            skipped = skipped.concat(result.valid.map(item => ({
              rowNumber: item.rowNumber,
              errors: [`batch save failed: ${error.message}`]
            })));
          }
        }
        showSummary(imported, skipped);
        if (imported) {
          setStatus('Import complete. Review the row summary before continuing.');
          showSuccessPopup(imported);
          if (showSkip) {
            cancelButton.hidden = true;
            continueButton.hidden = false;
          }
        } else {
          setStatus(skipped.length ? 'No events were imported. Review the skipped rows below.' : 'No events were imported.', true);
        }
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        isBusy = false;
        uploadButton.disabled = !selectedFile;
        cancelButton.disabled = false;
        closeButton.disabled = false;
        templateButton.disabled = false;
      }
    });
  }

  window.SchedulaScheduleExcel = { open };
})();
