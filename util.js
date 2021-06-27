/**
 * Returns a random number between min (inclusive) and max (inclusive).
 *
 * @param {number} min The minimum integer (inclusive)
 * @param {number} max The maximum integer (inclusive)
 * @returns {number} Random number between min and max
 */
function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns True if a random number is between min (inclusive) and max (inclusive), False otherwise.
 * @param n The number in question
 * @param {number} min The minimum integer (inclusive)
 * @param {number} max The maximum integer (inclusive)
 * @returns {boolean} True if n is between min and max, False otherwise
 */
function isBetween(n, min, max) {
    return n >= min && n <= max;
}

/**
 * Replace HTML special characters with normal characters
 * @param {string} str The string that may contain HTML special characters
 * @returns {string} A string with the HTML special characters replaced
 */
function replaceHTML(str) {
    return str
        .replace(/&#039;/g, '\'')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&minus;/g, '-');
}

/**
 * Add '0' in front of a number if it is single-digit (0-9)
 * @param {number} num 
 * @returns {string}
 */
function addPrefixZero(num) {
    return (num < 10 ? '0' : '') + num;
}

/**
 * Format date as yyyy-mm-dd hh:mm:ss
 * @param {Date} date 
 * @returns {string}
 */
function dateTimeFormat(date) {
    return date.getFullYear() + '-' + addPrefixZero(date.getMonth()) + '-' + addPrefixZero(date.getDate()) + ' '
        + addPrefixZero(date.getHours()) + ':' + addPrefixZero(date.getMinutes()) + ':' + addPrefixZero(date.getSeconds());
}

module.exports = {
    random: random,
    isBetween: isBetween,
    replaceHTML: replaceHTML,
    dateTimeFormat: dateTimeFormat
};