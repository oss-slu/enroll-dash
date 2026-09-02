/* 
    returns a datetime string in the format matching the function name e.g.
    August 30, 2026 12:49:28 AM => 083026_004928
*/
export const MMDDYY_HHMMSS = (date: Date) => {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return [
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        date.getFullYear().toString().slice(-2),
        '_',
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
};