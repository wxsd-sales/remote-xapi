/********************************************************
 * 
 * Author:              William Mills
 *                    	Solutions Engineer
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * 
 * Version: 1-0-0
 * Released: 02/23/26
 * 
 * Remote-XAPI:
 * 
 * JavaScript helper library for Cisco RoomOS macros that send xAPI
 * status, configuration, and command requests to remote RoomOS devices
 * over HTTPS using the local HttpClient xCommands.
 *
 * Key features:
 * - HTTP request queueing to prevent the macro runtime from exhausting
 *   the limited number of available HttpClient request slots.
 * - Built-in XML-to-JSON style parsing for RoomOS xAPI responses, which
 *   is needed because the Cisco Collaboration macro JavaScript runtime
 *   does not include a native XML parsing library.
 * 
 * Full Readme, source code and license details for this macro 
 * are available GitHub:
 * https://github.com/wxsd-sales/remote-xapi
 * 
 ********************************************************/

import xapi from 'xapi';

const DEBUG = globalThis?.process?.env?.REMOTE_XAPI_DEBUG === 'true';
const Timeout = 2;

/**
 * Creates a console wrapper that prefixes each log line with a component name.
 *
 * @param {string} prefix - Label added to the beginning of each console message.
 * @returns {Record<string, (...args: unknown[]) => void>} Object matching console methods.
 */
function loggerPrefix(prefix) {
  return Object.keys(console).reduce(
    (accumulator, method) => ({
      ...accumulator,
      [method]: (...args) => {
        if (!DEBUG) return;
        console[method](`[${prefix}.${method}]:`, ...args);
      },
    }),
    {},
  );
}

const httpQueue = new class HttpQueue {
  #queue = []
  #isProcessing = false;
  #logger;

  /**
   * Creates a serialized HTTP queue for RoomOS `HttpClient` calls.
   */
  constructor() {
    this.#logger = loggerPrefix('HttpQueue');
  }

  /**
   * Adds an HTTP request to the queue and resolves when that request completes.
   *
   * @param {{method: 'Get' | 'Post', options: Record<string, unknown>, payload?: string}} args - Request details.
   * @returns {Promise<unknown>} Promise resolving to the `xapi.Command.HttpClient` response.
   */
  async request(args) {
    if (DEBUG) this.#logger.log('New Request:', args);
    return new Promise((resolve, reject) => {
      this.#queue.push({ ...args, resolve, reject });
      if (this.#isProcessing) return
      this.#_processQueue();
    });
  }

  /**
   * Processes the next queued HTTP request, ensuring requests run one at a time.
   *
   * @returns {Promise<void>} Promise that settles after the current queue item finishes.
   */
  async #_processQueue() {
    if (this.#queue.length === 0) return this.#isProcessing = false;
    this.#isProcessing = true;
    const { method, options, payload, resolve, reject } = this.#queue.shift();
    if (DEBUG) this.#logger.debug(method, options, payload);
    try {
      const result = await xapi.Command.HttpClient[method](options, payload);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.#isProcessing = false;
      this.#_processQueue();
    }
  }
}

// const httpQueue = new HttpQueue();

export class RemoteXAPI {
  address;
  #baseUrl;
  #username;
  #password;
  #logger = loggerPrefix('RemoteXAPI');

  Event;
  Command;
  Status;
  Config;

  /**
   * Creates a remote xAPI client for another RoomOS endpoint.
   *
   * @param {{address: string, username: string, password: string}} endpoint - Remote endpoint connection details.
   */
  constructor(endpoint) {
    if (endpoint == null || typeof endpoint == 'undefined') {
      throw new Error('endpoint not defined');
    }

    const { address, username, password } = endpoint;
    if (!address) throw new Error('endpoint.address not defined');
    if (!username) throw new Error('endpoint.username not defined');
    if (!password) throw new Error('endpoint.password not defined');

    const ipv6_regex = /^(?:(?:[a-fA-F\d]{1,4}:){7}(?:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){6}(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){5}(?::(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,2}|:)|(?:[a-fA-F\d]{1,4}:){4}(?:(?::[a-fA-F\d]{1,4}){0,1}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,3}|:)|(?:[a-fA-F\d]{1,4}:){3}(?:(?::[a-fA-F\d]{1,4}){0,2}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,4}|:)|(?:[a-fA-F\d]{1,4}:){2}(?:(?::[a-fA-F\d]{1,4}){0,3}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,5}|:)|(?:[a-fA-F\d]{1,4}:){1}(?:(?::[a-fA-F\d]{1,4}){0,4}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,6}|:)|(?::(?:(?::[a-fA-F\d]{1,4}){0,5}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,7}|:)))(?:%[0-9a-zA-Z]{1,})?$/gm;     


    if(ipv6_regex.test(address)){
      this.#baseUrl = `https://[${address}]`;
    } else {
      this.#baseUrl = `https://${address}`;
    }


    this.address = address;
    this.#username = username;
    this.#password = password;
    this.#logger.log('New Connection Created - Address:', address)

    xapi.Config.HttpClient.Mode.set('On');
    xapi.Config.HttpClient.AllowInsecureHTTPS.set('True');

    /**
     * Builds a recursive proxy that lets callers access xAPI paths with dot notation.
     *
     * @param {RemoteXAPI} root - Root client instance that will execute the request.
     * @param {string[]} [path=[]] - Accumulated xAPI path segments.
     * @param {keyof RemoteXAPI} methodName - Method invoked when the proxy is called.
     * @param {string[]} [allowed=[]] - Property names that should invoke immediately instead of extending the path.
     * @returns {Function} Proxy function representing the next path segment.
     */
    function proxy(root, path = [], methodName, allowed = []) {
      const proxyTarget = (...args) => root[methodName](path, ...args);
      return new Proxy(proxyTarget, {
        get(_target, prop) {
           if (allowed.includes(prop)) {
          // if (typeof allowed != 'undefined' && allowed?.includes(prop)) {
            return (...args) => {
              return root[methodName](path, args?.[0], args?.[1])
            }
          }
          return proxy(root, path.concat(prop), methodName, allowed);
        },
        apply(_target, _thisArg, args) {
          if (typeof root?.[methodName] !== 'function') throw Error(`Property is not callable`)
          return root[methodName](path, ...args);
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });
    }

    this.request = this._request.bind(this);
    this.Command = proxy(this, ['Command'], 'request');
    this.Config = proxy(this, ["Configuration"], 'request', ['get', 'set', 'on']);
    this.Status = proxy(this, ['Status'], "request", ['get', 'on']);
  }

  /**
   * Converts a proxy path and arguments into a RoomOS HTTP request.
   *
   * @param {string[]} [path=[]] - xAPI path segments, such as `['Status', 'Audio', 'Volume']`.
   * @param {unknown} [params] - Command parameters or configuration value to send.
   * @param {string} [body] - Optional body content for commands that accept free-form text.
   * @returns {Promise<unknown>} Parsed xAPI response value for the requested path.
   */
  async _request(path = [], params, body) {
    if (DEBUG) this.#logger.debug('Path:', path, '\nParams', JSON.stringify(params), '\nBody:', body);

    // Initial request variables
    const type = path[0];
    const isHttpPost = type == 'Command' || (type == 'Configuration' && typeof params != 'undefined');
    const urlPath = isHttpPost ? '/putxml' : '/getxml?location=/' + path.join('/');
    const method = isHttpPost ? 'Post' : 'Get';

    const AllowInsecureHTTPS = 'True';
    const ResultBody = 'PlainText';
    const Url = `${this.#baseUrl}${urlPath}`;
    const Header = [
      "Authorization: Basic " + btoa(this.#username + ":" + this.#password),
      "Host: " + this.address,
      "Accept: */*"
    ];

    const options = { Url, Header, ResultBody, AllowInsecureHTTPS, Timeout, ResultBody };
    if (isHttpPost) Header.push('Content-Type: text/xml');
    const payload = isHttpPost ? pathParamsToXML(path, params, body) : undefined;

    if (DEBUG) {
      const safeHeaders = Header.map((header) =>
        header.startsWith('Authorization:') ? 'Authorization: [REDACTED]' : header
      );
      this.#logger.debug('Method:', method,
        '\nUrl:', Url,
        '\nHeader:', safeHeaders,
        isHttpPost ? '\nPayload:' + payload : '');
    }

    try {
      const result = await httpQueue.request({ method, options, payload });

      if (DEBUG) this.#logger.debug('Result Body:\n' + result?.Body);
      const parsedBody = parseXML(result?.Body ?? '');
      if (DEBUG) this.#logger.debug('Parsed Body:\n' + JSON.stringify(parsedBody));

      const errorReason = parsedBody?.ActionError?.Reason ?? parsedBody?.Command?.ActionError?.Reason;

      if (errorReason === 'No action detected in document') {
        throw { message: `Method not found - Path: ${JSON.stringify(path)} - Device: ${this.address}` };
      }

      if (type == 'Status' || (type == 'Configuration' && !isHttpPost)) {
        if (Array.isArray(parsedBody) && parsedBody.length == 0) return parsedBody;
        return getNestedValue(parsedBody, path);
      }

      if (type == 'Configuration') {
        return getNestedValue(parsedBody, path.slice(0, 1)) ?? parsedBody;
      }

      if (type == 'Command') {
        const resultEnd = path.length === 2 ? path.slice(1) : path.slice(path.length - 2);
        const resultPath = [type, resultEnd.join('') + 'Result'];
        return getNestedValue(parsedBody, resultPath);
      }

      return parsedBody;
    } catch (error) {
      if (DEBUG) this.#logger.error(error);
      const statusCode = error?.data?.StatusCode;
      if (statusCode == '401') {
        throw { message: `Unauthorized` };
      }
      if (error?.message?.startsWith('Method not found -')) {
        throw error;
      }
      throw { message: `[${this.address}]: ${error.message}` };
    }
  }

}

/**
 * Parses the subset of RoomOS XML responses used by this library into plain JavaScript objects.
 *
 * @param {string} xmlString - Raw XML response body.
 * @returns {unknown} Parsed XML structure with primitive values converted where possible.
 */
function parseXML(xmlString) {
  // Helper function to convert string values to numbers or booleans if applicable
  /**
   * Converts XML text nodes into booleans or numbers when appropriate.
   *
   * @param {string} value - Raw text value extracted from XML.
   * @returns {string | number | boolean} Converted primitive value.
   */
  const convertValue = (value) => {
    if (value === 'True') return true;
    if (value === 'False') return false;
    if (value === 'Yes') return true;
    if (value === 'No') return false;
    // Check if it's a valid number (not just an empty string or whitespace)
    if (!isNaN(value) && value.trim() !== '') {
      return Number(value);
    }
    return value;
  };

  // Recursive function to parse a single XML node (element)
  /**
   * Recursively parses a single XML element string.
   *
   * @param {string} nodeXml - XML for one element, including its children.
   * @returns {unknown} Parsed representation of the provided XML node.
   */
  const parseNode = (nodeXml) => {
    nodeXml = nodeXml.trim(); // Trim whitespace from the node XML string

    // Regex to find the main tag and its content: <tag attributes>content</tag>
    const match = nodeXml.match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>$/);

    if (!match) {
      // This block handles self-closing tags like <Tag/> and pure text content (leaf values like '51')
      const selfClosingMatch = nodeXml.match(/^<(\w+)([^>]*)\/>$/);
      if (selfClosingMatch) {
        const tagName = selfClosingMatch[1];
        const attrsString = selfClosingMatch[2];
        const attributes = {};
        if (attrsString) {
          // Parse attributes for self-closing tags
          const attrMatches = attrsString.matchAll(/(\w+)="([^"]*)"/g);
          const allowedAttrs = ['item', 'status']
          for (const attrMatch of attrMatches) {
            const key = attrMatch[1];
            const value = attrMatch[2];
            if (allowedAttrs.includes(key)) {
              attributes[key == 'item' ? 'id' : key] = value;
            }
          }
        }
        if (Object.keys(attributes).length > 0) {
          return { [tagName]: { ...attributes } };
        } else {
          // For empty self-closing tags without attributes, return null or an empty object
          return { [tagName]: null };
        }
      }
      // If it's not a tag at all, it must be pure text content
      return convertValue(nodeXml);
    }

    const tagName = match[1];
    const attrsString = match[2];
    let content = match[3];

    const elementResult = {}; // This object will hold attributes and child nodes

    // Parse attributes for the current tag
    if (attrsString) {
      const attrMatches = attrsString.matchAll(/(\w+)="([^"]*)"/g);
      const allowedAttrs = ['item', 'status']
      for (const attrMatch of attrMatches) {
        const key = attrMatch[1];
        const value = attrMatch[2];
        if (allowedAttrs.includes(key)) {
          elementResult[key == 'item' ? 'id' : key] = value;
        }
      }
    }


    // Check if content is purely text (no child tags within it)
    const firstOpenTagInContent = content.indexOf('<');
    if (firstOpenTagInContent === -1) {
      const textContent = content.trim();
      if (textContent) {
        // If there are attributes AND text content, store text under a special key '_text'
        if (Object.keys(elementResult).length > 0) {
          elementResult._text = convertValue(textContent);
        } else {
          // If no attributes and only text, the node's value is just the text content
          return { [tagName]: convertValue(textContent) };
        }
      }
    } else {
      // Content contains child nodes, so we need to parse them recursively
      let cursor = 0;
      const childNodes = {};

      while (cursor < content.length) {
        const nextOpenTagIndex = content.indexOf('<', cursor);
        if (nextOpenTagIndex === -1) {
          // No more tags, remaining content is text (e.g., whitespace between tags)
          // For this specific XML, we mostly expect whitespace here.
          break;
        }

        // Find the end of the current child tag's opening part
        let openTagStart = nextOpenTagIndex;
        let openTagEnd = content.indexOf('>', openTagStart);
        if (openTagEnd === -1) break; // Malformed XML if '>' is missing

        // Extract the child tag name
        let currentChildTagName = content.substring(openTagStart + 1, openTagEnd).split(/\s/)[0];
        let isSelfClosing = content[openTagEnd - 1] === '/';

        let childEndIndex = -1;
        if (isSelfClosing) {
          childEndIndex = openTagEnd + 1; // End of self-closing tag
        } else {
          // Find the corresponding closing tag by balancing open/close tags
          let openCount = 0;
          let tempCursor = openTagEnd + 1;
          while (tempCursor < content.length) {
            const nextOpen = content.indexOf('<' + currentChildTagName, tempCursor);
            const nextClose = content.indexOf('</' + currentChildTagName + '>', tempCursor);

            if (nextOpen !== -1 && (nextOpen < nextClose || nextClose === -1)) {
              // Found another opening tag of the same name before a closing tag
              openCount++;
              tempCursor = content.indexOf('>', nextOpen) + 1;
            } else if (nextClose !== -1) {
              // Found a closing tag
              if (openCount === 0) {
                childEndIndex = nextClose + ('</' + currentChildTagName + '>').length;
                break;
              } else {
                openCount--;
                tempCursor = nextClose + ('</' + currentChildTagName + '>').length;
              }
            } else {
              break; // Malformed XML or no matching closing tag
            }
          }
        }

        if (childEndIndex === -1) {
          // If a child's closing tag couldn't be found, break to avoid infinite loop
          break;
        }

        // Extract the full XML string for the child node
        const childXml = content.substring(nextOpenTagIndex, childEndIndex);
        const parsedChild = parseNode(childXml); // Recursive call to parse the child

        // The parsedChild will be an object like { "ChildTagName": value }
        const childTagName = Object.keys(parsedChild)[0];
        const childValue = parsedChild[childTagName];

        // Handle multiple child elements with the same tag name by creating an array
        if (childNodes[childTagName]) {
          if (!Array.isArray(childNodes[childTagName])) {
            childNodes[childTagName] = [childNodes[childTagName]];
          }
          childNodes[childTagName].push(childValue);
        } else {
          if (childValue && typeof childValue === 'object' && Object.prototype.hasOwnProperty.call(childValue, 'id')) {
            childNodes[childTagName] = [childValue];
          } else {
            childNodes[childTagName] = childValue;
          }
        }
        cursor = childEndIndex; // Move cursor past the parsed child
      }
      // Merge parsed child nodes into the current element's result
      Object.assign(elementResult, childNodes);
    }

    return { [tagName]: elementResult };
  };

  const cleanXml = xmlString.replace(/<\?xml[^>]*\?>/, '').trim();
  return parseNode(cleanXml);
};


/**
 * Builds the XML payload used for RoomOS `putxml` requests.
 *
 * @param {string[]} [path=[]] - xAPI path segments to turn into nested XML nodes.
 * @param {unknown} [params] - Optional parameter object or scalar value to include in the final node.
 * @param {string} [body] - Optional text body appended inside a `body` element.
 * @returns {string} XML payload ready to send to the device.
 */
function pathParamsToXML(path = [], params, body) {
  if (path.length == 0) return '';
  const nodes = [...path];

  /**
   * Escapes characters that are reserved in XML text and tag content.
   *
   * @param {unknown} val - Value to escape before interpolation into XML.
   * @returns {string} XML-safe string value.
   */
  function escapeXml(val) {
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  let innerXml;
  if (params === undefined) {
    innerXml = `<${escapeXml(nodes.pop())}/>`;
  } else if (typeof params === 'object' && params !== null) {
    const lastNode = escapeXml(nodes.pop());
    innerXml = `<${lastNode}>`;
    for (const [key, value] of Object.entries(params)) {
      innerXml += `<${escapeXml(key)}>${escapeXml(value)}</${escapeXml(key)}>`;
    }
    if (typeof body != 'undefined') {
      innerXml += `<body>${escapeXml(body)}</body>`;
    }
    innerXml += `</${lastNode}>`;
  } else {
    const lastNode = escapeXml(nodes.pop());
    innerXml = `<${lastNode}>${escapeXml(params)}</${lastNode}>`;
  }

  for (let i = nodes.length - 1; i >= 0; i--) {
    innerXml = `<${escapeXml(nodes[i])}>${innerXml}</${escapeXml(nodes[i])}>`;
  }

  return innerXml
}

/**
 * Reads a nested property using an array-based path.
 *
 * @param {Record<string, any> | null | undefined} [obj={}] - Source object to inspect.
 * @param {string[]} [path=[]] - Property path to resolve.
 * @returns {unknown} Value found at the requested path, or `undefined` if missing.
 */
function getNestedValue(obj = {}, path = []) {
  if (obj === null || typeof obj === 'undefined' || !Array.isArray(path)) return
  if (path.length === 0) return obj
  return path.reduce((currentValue, key) => {
    if (currentValue === null || typeof currentValue === 'undefined') return
    if (Object.prototype.hasOwnProperty.call(currentValue, key)) return currentValue[key];
  }, obj);
}
