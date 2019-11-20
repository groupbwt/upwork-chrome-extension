global.browser = require('webextension-polyfill')

const requestsFilter = {
    urls : ['https://*.upwork.com/ab/jobs/saved/api/getSavedJobs?*'],
    types: ['xmlhttprequest'],
};

// wait for request with jobs data
chrome.webRequest.onCompleted.addListener(() => {
    chrome.tabs.executeScript({
        code: '(' + initInjection + ')();',
    });
}, requestsFilter);

function initInjection() {
    const event = new CustomEvent('inject-html');
    window.dispatchEvent(event);
}