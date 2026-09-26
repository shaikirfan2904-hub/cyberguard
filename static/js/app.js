/**
 * CyberGuard AI — Core Application JS
 * Shared utilities used across the application.
 */

const CyberGuardApp = (function () {
    'use strict';

    let confirmCallback = null;
    let confirmInitialized = false;
    let passwordTogglesInitialized = false;

    /* =========================================================
       API
    ========================================================= */

    async function api(url, options) {
        try {
            const opts = Object.assign({}, options || {});
            const headers = Object.assign({}, opts.headers || {});

            if (opts.body && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }

            opts.headers = headers;

            const response = await fetch(url, opts);

            let data;

            try {
                data = await response.json();
            } catch (error) {
                data = {
                    success: false,
                    message: 'Invalid server response.'
                };
            }

            if (!response.ok) {
                data.success = false;

                if (!data.message) {
                    data.message = `Request failed (${response.status})`;
                }
            }

            return data;

        } catch (error) {
            console.error('[CyberGuard API]', error);

            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }


    /* =========================================================
       TOAST
    ========================================================= */

    function toast(message, type) {
        const container = document.getElementById('toastContainer');

        if (!container) {
            console.warn('[CyberGuard] Toast container not found.');
            return;
        }

        const allowedTypes = [
            'success',
            'error',
            'warning',
            'info'
        ];

        type = allowedTypes.includes(type) ? type : 'info';

        const icons = {
            success:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon">' +
                '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>' +
                '<polyline points="22 4 12 14.01 9 11.01"/>' +
                '</svg>',

            error:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<line x1="15" y1="9" x2="9" y2="15"/>' +
                '<line x1="9" y1="9" x2="15" y2="15"/>' +
                '</svg>',

            warning:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon">' +
                '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>' +
                '<line x1="12" y1="9" x2="12" y2="13"/>' +
                '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
                '</svg>',

            info:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<line x1="12" y1="16" x2="12" y2="12"/>' +
                '<line x1="12" y1="8" x2="12.01" y2="8"/>' +
                '</svg>'
        };

        const element = document.createElement('div');

        element.className = `toast toast--${type}`;

        element.innerHTML =
            icons[type] +
            '<span>' +
            escapeHtml(message) +
            '</span>';

        container.appendChild(element);

        window.setTimeout(function () {
            element.classList.add('toast--out');

            window.setTimeout(function () {
                if (element && element.parentNode) {
                    element.remove();
                }
            }, 300);

        }, 4000);
    }


    /* =========================================================
       CONFIRM DIALOG
    ========================================================= */

    function confirm(title, message, callback) {
        const modal = document.getElementById('confirmModal');

        if (!modal) {
            if (typeof callback === 'function') {
                callback(true);
            }
            return;
        }

        const titleElement = document.getElementById('confirmTitle');
        const messageElement = document.getElementById('confirmMessage');

        if (titleElement) {
            titleElement.textContent = title || 'Confirm';
        }

        if (messageElement) {
            messageElement.textContent = message || '';
        }

        confirmCallback =
            typeof callback === 'function'
                ? callback
                : function () {};

        modal.style.display = 'flex';
    }


    function closeConfirm(result) {
        const modal = document.getElementById('confirmModal');

        if (modal) {
            modal.style.display = 'none';
        }

        const callback = confirmCallback;

        confirmCallback = null;

        if (typeof callback === 'function') {
            callback(result);
        }
    }


    function initConfirm() {
        if (confirmInitialized) {
            return;
        }

        const modal = document.getElementById('confirmModal');

        if (!modal) {
            return;
        }

        confirmInitialized = true;

        const cancelButton = document.getElementById('confirmCancel');
        const okButton = document.getElementById('confirmOk');

        if (cancelButton) {
            cancelButton.addEventListener('click', function () {
                closeConfirm(false);
            });
        }

        if (okButton) {
            okButton.addEventListener('click', function () {
                closeConfirm(true);
            });
        }

        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeConfirm(false);
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal.style.display === 'flex') {
                closeConfirm(false);
            }
        });
    }


    /* =========================================================
       HELPERS
    ========================================================= */

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }


    function getInitials(name) {
        if (!name) {
            return '?';
        }

        const value = String(name).trim();

        if (!value) {
            return '?';
        }

        return value.charAt(0).toUpperCase();
    }


    function parseDate(value) {
        if (!value) {
            return null;
        }

        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        const stringValue = String(value);

        const normalized =
            stringValue.endsWith('Z')
                ? stringValue
                : stringValue + 'Z';

        const date = new Date(normalized);

        return isNaN(date.getTime()) ? null : date;
    }


    function formatTime(isoStr) {
        const date = parseDate(isoStr);

        if (!date) {
            return '';
        }

        const now = new Date();
        const diff = (now - date) / 1000;

        if (diff < 60) {
            return 'now';
        }

        if (diff < 3600) {
            return Math.floor(diff / 60) + 'm ago';
        }

        if (diff < 86400) {
            return date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        if (diff < 604800) {
            return Math.floor(diff / 86400) + 'd ago';
        }

        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric'
        });
    }


    function formatDate(isoStr) {
        const date = parseDate(isoStr);

        if (!date) {
            return '—';
        }

        return date.toLocaleDateString([], {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }


    function formatTimeShort(isoStr) {
        const date = parseDate(isoStr);

        if (!date) {
            return '';
        }

        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }


    function formatDateLabel(isoStr) {
        const date = parseDate(isoStr);

        if (!date) {
            return '';
        }

        const now = new Date();

        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        const target = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        const diff = Math.round(
            (today - target) / 86400000
        );

        if (diff === 0) {
            return 'Today';
        }

        if (diff === 1) {
            return 'Yesterday';
        }

        if (diff >= 2 && diff < 7) {
            return date.toLocaleDateString([], {
                weekday: 'long'
            });
        }

        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }


    function isSameDay(iso1, iso2) {
        const date1 = parseDate(iso1);
        const date2 = parseDate(iso2);

        if (!date1 || !date2) {
            return false;
        }

        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    }


    /* =========================================================
       CONNECTION STATUS
    ========================================================= */

    function setConnectionStatus(connected) {
        const element =
            document.getElementById('connectionStatus');

        if (!element) {
            return;
        }

        const dot =
            element.querySelector('.conn-dot');

        const text =
            document.getElementById('connectionText');

        if (connected) {

            if (dot) {
                dot.className =
                    'conn-dot conn-dot--connected';
            }

            if (text) {
                text.textContent = 'Connected';
            }

            element.style.opacity = '0.8';

        } else {

            if (dot) {
                dot.className =
                    'conn-dot conn-dot--disconnected';
            }

            if (text) {
                text.textContent = 'Reconnecting...';
            }

            element.style.opacity = '1';
        }
    }


    /* =========================================================
       PASSWORD TOGGLES
    ========================================================= */

    function initPasswordToggles() {
        if (passwordTogglesInitialized) {
            return;
        }

        const buttons =
            document.querySelectorAll('.password-toggle');

        if (!buttons.length) {
            return;
        }

        passwordTogglesInitialized = true;

        buttons.forEach(function (button) {

            button.addEventListener('click', function () {

                const targetId =
                    this.dataset.target;

                if (!targetId) {
                    return;
                }

                const target =
                    document.getElementById(targetId);

                if (!target) {
                    return;
                }

                const showing =
                    target.type === 'password';

                target.type =
                    showing ? 'text' : 'password';

                this.style.opacity =
                    showing ? '1' : '';

                this.setAttribute(
                    'aria-pressed',
                    showing ? 'true' : 'false'
                );
            });

        });
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    return {
        api: api,
        toast: toast,

        confirm: confirm,
        initConfirm: initConfirm,

        initPasswordToggles:
            initPasswordToggles,

        escapeHtml: escapeHtml,
        getInitials: getInitials,

        formatTime: formatTime,
        formatDate: formatDate,
        formatTimeShort: formatTimeShort,
        formatDateLabel: formatDateLabel,
        isSameDay: isSameDay,

        setConnectionStatus:
            setConnectionStatus
    };

})();


/* =============================================================
   GLOBAL
============================================================= */

window.CyberGuardApp = CyberGuardApp;


/* =============================================================
   GLOBAL INITIALIZATION
============================================================= */

document.addEventListener(
    'DOMContentLoaded',
    function () {

        CyberGuardApp.initConfirm();
        CyberGuardApp.initPasswordToggles();

    }
);