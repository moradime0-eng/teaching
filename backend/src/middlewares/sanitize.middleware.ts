import sanitizeHtml from 'sanitize-html';
import { Request, Response, NextFunction } from 'express';

/**
 * Sanitize HTML configuration for rich text fields.
 * Allows safe formatting tags while preventing XSS attacks.
 */
const RICH_TEXT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // Block elements
    'p', 'br', 'div', 'span',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Text formatting
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'mark',
    // Lists
    'ul', 'ol', 'li',
    // Blockquotes & code
    'blockquote', 'pre', 'code',
    // Links & media
    'a', 'img', 'video', 'source',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Misc
    'hr', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height', 'title', 'loading'],
    'video': ['src', 'controls', 'width', 'height', 'poster'],
    'source': ['src', 'type'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan', 'scope'],
    'code': ['class'],
    'pre': ['class'],
    'span': ['class', 'style'],
    'p': ['style'],
    'div': ['class', 'style'],
    'mark': ['style'],
  },
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'background-color': [/.*/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-size': [/^\d+(px|em|rem|%)?$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  disallowedTagsMode: 'discard',
};

/**
 * Compact sanitize config for short text fields (admin notes, ban reasons, etc.)
 * Only allows basic text formatting.
 */
const COMPACT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li'],
  allowedAttributes: {
    'a': ['href', 'target'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
};

/**
 * Fields that should receive full rich text sanitization.
 */
const RICH_TEXT_FIELDS = [
  'description',
  'biography',
  'bio',
  'content',
  'metaDescription',
  'message',
  'body',
  'htmlContent',
  'shortDescription',
  'comment',
  'articleContent',
  'richTextContent',
];

/**
 * Fields that should receive compact sanitization (short admin text).
 */
const COMPACT_SANITIZE_FIELDS = [
  'rejectReason',
  'banReason',
  'replyText',
  'reply',
  'answer',
  'notes',
  'comment',
  'feedback',
];

/**
 * Sanitize a single value (string or object with HTML).
 */
function sanitizeValue(value: any, options: sanitizeHtml.IOptions): any {
  if (typeof value === 'string') {
    return sanitizeHtml(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, options));
  }
  if (value && typeof value === 'object') {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val, options);
    }
    return sanitized;
  }
  return value;
}

/**
 * Middleware to sanitize HTML in request body fields.
 * 
 * Usage:
 *   router.post('/courses', sanitizeRichText, controller.create);
 *   router.post('/tickets/reply', sanitizeCompactText, controller.reply);
 */
export function sanitizeRichText(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    for (const field of RICH_TEXT_FIELDS) {
      if (req.body[field]) {
        req.body[field] = sanitizeValue(req.body[field], RICH_TEXT_SANITIZE_OPTIONS);
      }
    }
    // Also check nested objects (e.g., sections[].lectures[].content)
    if (req.body.sections && Array.isArray(req.body.sections)) {
      req.body.sections = req.body.sections.map((section: any) => {
        if (section.lectures && Array.isArray(section.lectures)) {
          section.lectures = section.lectures.map((lecture: any) => {
            if (lecture.content) {
              lecture.content = sanitizeHtml(lecture.content, RICH_TEXT_SANITIZE_OPTIONS);
            }
            return lecture;
          });
        }
        return section;
      });
    }
  }
  next();
}

/**
 * Middleware to sanitize compact HTML fields (admin notes, ban reasons, etc.)
 */
export function sanitizeCompactText(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    for (const field of COMPACT_SANITIZE_FIELDS) {
      if (req.body[field]) {
        req.body[field] = sanitizeValue(req.body[field], COMPACT_SANITIZE_OPTIONS);
      }
    }
  }
  next();
}

/**
 * Generic sanitizer middleware factory.
 * Pass field names to sanitize specific fields only.
 */
export function sanitizeFields(
  fields: string[],
  options: sanitizeHtml.IOptions = RICH_TEXT_SANITIZE_OPTIONS
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (req.body[field]) {
          req.body[field] = sanitizeValue(req.body[field], options);
        }
      }
    }
    next();
  };
}

export { RICH_TEXT_SANITIZE_OPTIONS, COMPACT_SANITIZE_OPTIONS };
