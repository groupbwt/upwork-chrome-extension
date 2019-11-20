global.browser = require('webextension-polyfill')

// import Vue from 'vue'
// import App from './App'
//
// /* eslint-disable no-new */
// new Vue({
//   el: '#app',
//   render: h => h(App)
// })

import './content.scss';
import { who_add, priority } from './selectsData.json';
import * as firebase from "firebase/app";
import "firebase/database";

const firebaseConfig = {
    apiKey       : "AIzaSyDvYkxqljlfi9Huh6ZeQCes4KMlV6PDvmg",
    authDomain   : "upwork-extension.firebaseapp.com",
    databaseURL  : "https://upwork-extension.firebaseio.com",
    storageBucket: "upwork-extension.appspot.com",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const jobsRef = db.ref('jobs');
const mainJobUrl = '/job';

let prevScreenWidth = window.innerWidth;

// this event dispatching at background.js
window.addEventListener('inject-html', injectHTML);

function injectHTML() {
    let whoAddOptions = (who_add.map((el) => `<option value="${el.name}">${el.name}</option>`)).join('');
    let priorityOptions = (priority.map((el) => `<option value="${el.name}">${el.name}</option>`)).join('');
    const cardMarkup = `
      <div class="col-12 col-lg-6 form-group ext-col-select">
        <select class="form-control ext-select ext-select--who">
          <option value="0">Agent</option>
          ${whoAddOptions}
        </select>
      </div>
      <div class="col-12 col-lg-6 form-group ext-col-select">
        <select class="form-control ext-select ext-select--priority">
          <option value="0">Priority</option>
          ${priorityOptions}
        </select>
      </div>
      <div class="col-12 form-group ext-col-text">
        <textarea class="form-control ext-textarea" placeholder="Enter comment..."></textarea>
      </div>
    `;

    const div = document.createElement('div');
    div.className = 'row ext-row ext-who';
    div.innerHTML = cardMarkup;
    // if data-ext-id present - there is already exist form card
    // and don't need to add it
    const jobCards = document.querySelectorAll('.job-tile:not([data-ext-id])');
    jobCards.forEach((el, index) => {
        const newDiv = div.cloneNode(true);
        newDiv.id = `job-${index + 1}`;
        newDiv.dataset.jobLink = el.querySelector('a.job-title-link').href;
        el.classList.add('ext-priority');
        el.appendChild(newDiv);
    });

    injectDynamicClasses();
    resizer();
    listener();

    // add data-ext-id after listeners() because it used there
    jobCards.forEach((el, index) => {
        el.dataset.extId = `job-${index + 1}`;
    });

    // need for firebase events
    document.body.classList.add('ext-loaded');
}

// dynamically build .ext-who and .ext-priority classes
// because colors data for its passed from json
// in this case it easier to change data
function injectDynamicClasses() {
    if (document.querySelector('#ext-styles')) {
        return;
    }

    const style = document.createElement('style');
    const whoClasses = who_add.map((el) => `.ext-who--${el.name.replace(' ', '_').replace('.', '_')}:after{background-color:${el.color}}`).join('');
    const priorityClasses = priority.map((el) => `.ext-priority--${el.name.toLowerCase()}:after{background-color:${el.color}}`).join('');
    style.id = 'ext-styles';
    style.innerHTML = whoClasses + priorityClasses;
    document.head.appendChild(style);
}

// calculate and set margin-left for container with job cards
// need to center containers after form cards adding
function resizer() {
    // card container width + our card width + indent between both
    const contentWidth = document.querySelector('.air-card').clientWidth + 355 + 15;
    // container full width - content width
    // divide by 2 because have left and right margin
    const marginLeft = Math.round((document.querySelector('.layout-page-content').clientWidth - contentWidth) / 2);
    document.querySelector('.container.container-old').style.marginLeft = `${marginLeft < 40 ? 40 : marginLeft}px`;
}

function listener() {
    // our card is inside tag of job card
    // job card click is opening modal
    // so we need to prevent it
    document.querySelectorAll('.job-tile:not([data-ext-id]) .ext-row').forEach((row) => {
        row.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    window.addEventListener('resize', resizeListener);
    window.addEventListener('orientationchange', resizeListener);

    const whoClasses = who_add.map((el) => `ext-who--${el.name.replace(' ', '_').replace('.', '_')}`);
    document.querySelectorAll('.job-tile:not([data-ext-id]) .ext-select--who').forEach((el) => {
        el.addEventListener('change', function() {
            const formCard = el.parentElement.parentElement;
            const data = {
                url     : formCard.dataset.jobLink,
                who_add : el.value,
                priority: formCard.querySelector('.ext-select--priority').value,
                comment : formCard.querySelector('.ext-textarea').value,
            };
            saveJob(formCard.id, data);
            formCard.classList.remove(...whoClasses);
            if (el.value.length > 1) {
                formCard.classList.add(`ext-who--${el.value.replace(' ', '_').replace('.', '_')}`);
            }
        });
    });

    document.querySelectorAll('.job-tile:not([data-ext-id]) .ext-select--priority').forEach((el) => {
        el.addEventListener('change', function() {
            const formCard = el.parentElement.parentElement;
            const data = {
                url     : formCard.dataset.jobLink,
                who_add : formCard.querySelector('.ext-select--who').value,
                priority: el.value,
                comment : formCard.querySelector('.ext-textarea').value,
            };
            saveJob(formCard.id, data);
            const jobCard = document.querySelector(`.job-tile[data-ext-id=${formCard.id}]`);
            jobCard.classList.remove('ext-priority--high', 'ext-priority--medium', 'ext-priority--low');
            if (el.value.length > 1) {
                jobCard.classList.add(`ext-priority--${el.value.toLowerCase()}`);
            }
        });
    });

    document.querySelectorAll('.job-tile:not([data-ext-id]) .ext-textarea').forEach((el) => {
        el.addEventListener('change', function() {
            const formCard = el.parentElement.parentElement;
            const data = {
                url     : formCard.dataset.jobLink,
                who_add : formCard.querySelector('.ext-select--who').value,
                priority: formCard.querySelector('.ext-select--priority').value,
                comment : el.value,
            };
            saveJob(formCard.id, data);
        });
    });

    // Firebase updates
    if (document.body.classList.contains('ext-loaded')) {
        // if class exist - it means that page was changed by pagination
        // and listener already exist so we need only load data
        jobsRef.once('value').then((snap) => {
            const data = snap.val();
            for (const el in data) {
                if (data.hasOwnProperty(el)) {
                    const jobUrl = `${mainJobUrl}/${el}`;
                    const jobCards = document.querySelectorAll(`.job-tile[data-ext-id]`);
                    jobCards.forEach((card) => {
                        const link = card.querySelector(`a[href*="${jobUrl}"]`);
                        if (link) {
                            card.querySelector('.ext-select--who').value = data[el].who_add;
                            card.querySelector('.ext-select--priority').value = data[el].priority;
                            card.querySelector('.ext-textarea').value = data[el].comment;
                            card.classList.add(`ext-priority--${data[el].priority.toLowerCase()}`);
                            card.querySelector(`#${card.dataset.extId}`).classList.add(`ext-who--${data[el].who_add.replace(' ', '_').replace('.', '_')}`);
                        }
                    });
                }
            }
        });
    } else {
        // if class not exist - it means that page loaded first time
        // and we need to initialize listener for data changing
        jobsRef.on('value', (snap) => {
            const data = snap.val();
            for (const el in data) {
                if (data.hasOwnProperty(el)) {
                    const jobUrl = `${mainJobUrl}/${el}`;
                    const jobCards = document.querySelectorAll(`.job-tile[data-ext-id]`);
                    jobCards.forEach((card) => {
                        const link = card.querySelector(`a[href*="${jobUrl}"]`);
                        if (link) {
                            card.querySelector('.ext-select--who').value = data[el].who_add;
                            card.querySelector('.ext-select--priority').value = data[el].priority;
                            card.querySelector('.ext-textarea').value = data[el].comment;
                            card.classList.add(`ext-priority--${data[el].priority.toLowerCase()}`);
                            card.querySelector(`#${card.dataset.extId}`).classList.add(`ext-who--${data[el].who_add.replace(' ', '_').replace('.', '_')}`);
                        }
                    });
                }
            }
        });
    }
}

function resizeListener() {
    const currentScreenWidth = window.innerWidth;
    // on screen width < 992 there is reloading content and changing markup
    if (currentScreenWidth > 992) {
        // was changed markup so need to again inject html
        if (prevScreenWidth < 992) {
            injectHTML();
            prevScreenWidth = window.innerWidth;
        } else {
            resizer();
        }
    }
}

function saveJob(jobId, data) {
    setLoading(jobId);
    const jobUrlSplited = data.url.split('/');
    const key = jobUrlSplited[jobUrlSplited.length - 2];
    jobsRef.child(key).set(data).finally(() => {
        setLoading(jobId, false);
    });
}

function setLoading(jobId, state = true) {
    const job = document.querySelector(`.job-tile[data-ext-id="${jobId}"]`);
    job.querySelector('.ext-select--who').disabled = state;
    job.querySelector('.ext-select--priority').disabled = state;
    job.querySelector('.ext-textarea').disabled = state;
}