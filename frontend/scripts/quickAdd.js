(function (root) {
  const DAYS = [
    { name: 'Monday', pattern: 'mon(?:day)?' },
    { name: 'Tuesday', pattern: 'tue(?:s(?:day)?)?' },
    { name: 'Wednesday', pattern: 'wed(?:nesday)?' },
    { name: 'Thursday', pattern: 'thu(?:rs?(?:day)?)?' },
    { name: 'Friday', pattern: 'fri(?:day)?' },
    { name: 'Saturday', pattern: 'sat(?:urday)?' },
    { name: 'Sunday', pattern: 'sun(?:day)?' }
  ];
  const dayPattern = DAYS.map(day => day.pattern).join('|');

  function dayMatches(text) {
    const matches = text.match(new RegExp(`\\b(?:${dayPattern})\\b`, 'gi')) || [];
    return [...new Set(matches.map(match => {
      const day = DAYS.find(candidate => new RegExp(`^${candidate.pattern}$`, 'i').test(match));
      return day?.name;
    }).filter(Boolean))];
  }

  function getTimeRange(text) {
    const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!match) return null;
    const startMeridiem = (match[3] || match[6] || '').toLowerCase();
    const endMeridiem = (match[6] || match[3] || '').toLowerCase();
    const start = toMinutes(match[1], match[2], startMeridiem);
    const end = toMinutes(match[4], match[5], endMeridiem);
    if (start === null || end === null || end <= start) return null;
    return { start, end, text: match[0], index: match.index };
  }

  function toMinutes(hourText, minuteText, meridiem) {
    let hour = Number(hourText);
    const minute = Number(minuteText || 0);
    if (minute > 59) return null;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      if (meridiem === 'pm' && hour !== 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
    } else if (hour > 23) {
      return null;
    }
    return hour * 60 + minute;
  }

  function formatTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function cleanText(text) {
    return text.replace(/\s+/g, ' ').replace(/^[\s,;:/.-]+|[\s,;:/.-]+$/g, '').trim();
  }

  function parseClass(text, days, timeRange) {
    const firstDay = new RegExp(`\\b(?:${dayPattern})\\b`, 'i').exec(text);
    const title = cleanText(text.slice(0, firstDay.index)).replace(/^(?:add|schedule|class)\s+/i, '');
    if (!title) throw new Error('Include a class or block name before the weekday.');

    let description = text
      .replace(new RegExp(`\\b(?:${dayPattern})\\b`, 'gi'), ' ')
      .replace(timeRange.text, ' ')
      .replace(title, ' ');
    description = cleanText(description.replace(/\b(?:on|at|every|and)\b/gi, ' '));
    description = description.replace(/\b(?:rm|room)\s*(\w+)/gi, 'Room $1');
    const modality = /\b(?:online|zoom|google meet|teams)\b/i.test(text) ? 'online' : 'onsite';

    return {
      type: 'weekly_block',
      block: {
        title,
        description,
        weekdays: days,
        start_time: formatTime(timeRange.start),
        end_time: formatTime(timeRange.end),
        modality
      }
    };
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function nextWeekday(dayName, today) {
    const target = DAYS.findIndex(day => day.name === dayName);
    const daysAhead = (target - (today.getDay() + 6) % 7 + 7) % 7 || 7;
    const result = new Date(today);
    result.setDate(result.getDate() + daysAhead);
    return result;
  }

  function parseDuration(text) {
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const minutes = /^(?:h|hr|hrs|hour|hours)$/i.test(match[2]) ? amount * 60 : amount;
    return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
  }

  function parseRequest(text, days, isSmart) {
    const duration = parseDuration(text);
    if (!duration) throw new Error('Add a request duration, for example “1 hr” or “90 min”.');

    const today = new Date();
    const request = {
      request_type: isSmart ? 'smart_schedule_request' : 'meeting_request',
      title: '',
      source_text: text,
      duration_minutes: duration,
      window_start: null,
      window_end: null,
      preferred_date: null,
      preferred_start_time: null,
      time_of_day: null,
      weekdays: days
    };

    if (/\b(?:tomorrow|bukas)\b/i.test(text)) {
      const date = new Date(today);
      date.setDate(date.getDate() + 1);
      request.preferred_date = localDateString(date);
    } else if (/\btoday\b/i.test(text)) {
      request.preferred_date = localDateString(today);
    } else if (days.length) {
      request.preferred_date = localDateString(nextWeekday(days[0], today));
    } else if (/\bthis week\b/i.test(text)) {
      const end = new Date(today);
      end.setDate(end.getDate() + (6 - ((today.getDay() + 6) % 7)));
      request.window_start = localDateString(today);
      request.window_end = localDateString(end);
    }

    const timeOfDay = text.match(/\b(morning|afternoon|evening|umaga|hapon|gabi)\b/i)?.[0].toLowerCase();
    request.time_of_day = ({
      morning: 'morning', umaga: 'morning',
      afternoon: 'afternoon', hapon: 'afternoon',
      evening: 'evening', gabi: 'evening'
    })[timeOfDay] || null;

    const preferredTime = text.match(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
      || text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (preferredTime) {
      const minutes = toMinutes(preferredTime[1], preferredTime[2], preferredTime[3].toLowerCase());
      if (minutes === null) throw new Error('The requested start time is not valid.');
      request.preferred_start_time = formatTime(minutes);
    }

    if (isSmart) {
      const titleText = text
        .replace(/^.*?\b(?:find|look for)\s+(?:a\s+)?time\s+for\s+/i, '')
        .replace(/^.*?\b(?:schedule|find)\s+(?:a\s+)?time\s+for\s+/i, '');
      request.title = cleanText(titleText
        .replace(/\b(?:this week|next week|today|tomorrow|bukas|umaga|hapon|gabi|morning|afternoon|evening)\b/gi, ' ')
        .replace(new RegExp(`\\b(?:${dayPattern})\\b`, 'gi'), ' ')
        .replace(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/gi, ' ')
        .replace(/\b(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' '));
    } else {
      const topic = text.match(/\bmeeting\s+(?:with|for)\s+(.+?)(?=\s+\b(?:tomorrow|bukas|today|this week|morning|afternoon|evening|umaga|hapon|gabi)\b|[,;]|$)/i)?.[1];
      request.title = topic ? `Meeting with ${cleanText(topic)}` : 'Meeting';
    }
    if (!request.title) request.title = 'Meeting';

    return { type: request.request_type, request };
  }

  function parseCancel(text, days) {
    if (!days.length) throw new Error('Say which weekday’s class or block to cancel.');
    const titleFilter = cleanText(text
      .replace(/^\s*(?:please\s+)?(?:cancel|remove|delete|drop)\s+/i, '')
      .replace(/\b(?:my|class|block|course|on|for|the)\b/gi, ' ')
      .replace(new RegExp(`\\b(?:${dayPattern})\\b`, 'gi'), ' '));
    return { type: 'delete', weekdays: days, title_filter: titleFilter.toLowerCase() };
  }

  function parse(input) {
    const text = cleanText(String(input || ''));
    if (!text) throw new Error('Type a schedule sentence first.');
    const days = dayMatches(text);

    if (/^\s*(?:please\s+)?(?:cancel|remove|delete|drop)\b/i.test(text)) {
      return parseCancel(text, days);
    }

    const isSmart = /\b(?:find|look for)\s+(?:a\s+)?time\b|\bsmart schedule\b/i.test(text);
    const isMeeting = /\b(?:meeting|mtg|meet)\b/i.test(text);
    if (isSmart || isMeeting) return parseRequest(text, days, isSmart);

    const timeRange = getTimeRange(text);
    if (days.length && timeRange) return parseClass(text, days, timeRange);
    throw new Error('Could not recognize that. Try a class with weekdays and a time range, a meeting request with a duration, or a weekday cancellation.');
  }

  const api = { parse };
  root.SchedulaQuickAdd = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
