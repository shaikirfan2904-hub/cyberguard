/**
 * CyberGuard AI — Admin Dashboard JS
 * Handles admin panel tabs, stats, charts, and tables.
 */

const Admin = (function () {
    'use strict';

    let currentTab = 'overview';

    async function init() {
        initTabs();
        await loadStats();
        await loadAbusers();
        await loadBlockedMessages();
        await loadUsers();
        initSearch();
    }

    /* ---- Tabs ---- */
    function initTabs() {
        document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.admin-nav-item').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                document.querySelectorAll('.admin-tab-content').forEach(function (c) { c.classList.remove('active'); });
                const tab = this.dataset.adminTab;
                currentTab = tab;
                document.getElementById('adminTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
            });
        });
    }

    /* ---- Stats ---- */
    async function loadStats() {
        const res = await CyberGuardApp.api('/api/admin/stats');
        if (!res.success) {
            if (res.message && res.message.includes('authentication')) {
                window.location.href = '/admin_login';
            }
            return;
        }
        const d = res.data;
        document.getElementById('statTotalUsers').textContent = d.total_users;
        document.getElementById('statOnlineUsers').textContent = d.online_users;
        document.getElementById('statTotalMessages').textContent = d.total_messages;
        document.getElementById('statBlockedMessages').textContent = d.blocked_messages;
        document.getElementById('statFlaggedUsers').textContent = d.flagged_users;
        document.getElementById('statTotalViolations').textContent = d.total_violations;

        renderChart('msgChart', d.messages_timeline || []);
        renderChart('blockedChart', d.blocked_timeline || [], true);
        loadRecentBlocked();
    }

    function renderChart(containerId, data, isBlocked) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state empty-state--sm"><p>No data for this period.</p></div>';
            return;
        }

        const maxVal = Math.max.apply(null, data.map(function (d) { return d.count; })) || 1;

        container.innerHTML = data.map(function (d) {
            const height = Math.max((d.count / maxVal) * 160, 4);
            const date = new Date(d.date);
            const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            return '<div class="chart-bar' + (isBlocked ? ' chart-bar--blocked' : '') + '" style="height:' + height + 'px">' +
                '<span class="chart-bar-value">' + d.count + '</span>' +
                '<span class="chart-bar-label">' + label + '</span>' +
                '</div>';
        }).join('');
    }

    async function loadRecentBlocked() {
        const res = await CyberGuardApp.api('/api/admin/blocked-messages');
        if (!res.success) return;
        const data = (res.data || []).slice(0, 5);
        const tbody = document.getElementById('recentBlockedTable');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No blocked messages found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function (m) {
            return '<tr>' +
                '<td class="username-cell">' + CyberGuardApp.escapeHtml(m.username) + '</td>' +
                '<td class="message-cell">' + CyberGuardApp.escapeHtml(m.message.substring(0, 60)) + '</td>' +
                '<td><span class="risk-badge risk-badge--CRITICAL">' + CyberGuardApp.escapeHtml(m.classification) + '</span></td>' +
                '<td><div class="confidence-bar"><div class="confidence-track"><div class="confidence-fill" style="width:' + (m.confidence * 100) + '%"></div></div><span class="confidence-text">' + (m.confidence * 100).toFixed(0) + '%</span></div></td>' +
                '<td>' + CyberGuardApp.formatTime(m.created_at) + '</td>' +
                '</tr>';
        }).join('');
    }

    /* ---- Abusers ---- */
    async function loadAbusers(search) {
        const url = '/api/admin/abusers' + (search ? '?q=' + encodeURIComponent(search) : '');
        const res = await CyberGuardApp.api(url);
        if (!res.success) return;
        const tbody = document.getElementById('abusersTable');
        const data = res.data || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No abusive users found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function (a) {
            return '<tr>' +
                '<td class="username-cell">' + CyberGuardApp.escapeHtml(a.username) + '</td>' +
                '<td>' + CyberGuardApp.escapeHtml(a.display_name || a.username) + '</td>' +
                '<td><strong>' + a.violations + '</strong></td>' +
                '<td><span class="risk-badge risk-badge--' + a.risk_level + '">' + a.risk_level + '</span></td>' +
                '<td>' + (a.last_violation ? CyberGuardApp.formatTime(a.last_violation) : '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    /* ---- Blocked messages ---- */
    async function loadBlockedMessages(search) {
        const url = '/api/admin/blocked-messages' + (search ? '?q=' + encodeURIComponent(search) : '');
        const res = await CyberGuardApp.api(url);
        if (!res.success) return;
        const tbody = document.getElementById('blockedTable');
        const data = res.data || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No blocked messages found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function (m) {
            return '<tr>' +
                '<td class="username-cell">' + CyberGuardApp.escapeHtml(m.username) + '</td>' +
                '<td class="message-cell">' + CyberGuardApp.escapeHtml(m.message.substring(0, 80)) + '</td>' +
                '<td><span class="risk-badge risk-badge--CRITICAL">' + CyberGuardApp.escapeHtml(m.classification) + '</span></td>' +
                '<td><div class="confidence-bar"><div class="confidence-track"><div class="confidence-fill" style="width:' + (m.confidence * 100) + '%"></div></div><span class="confidence-text">' + (m.confidence * 100).toFixed(0) + '%</span></div></td>' +
                '<td>' + CyberGuardApp.escapeHtml(m.reason || '—') + '</td>' +
                '<td>' + CyberGuardApp.formatTime(m.created_at) + '</td>' +
                '</tr>';
        }).join('');
    }

    /* ---- All users ---- */
    async function loadUsers(search) {
        const url = '/api/admin/users' + (search ? '?q=' + encodeURIComponent(search) : '');
        const res = await CyberGuardApp.api(url);
        if (!res.success) return;
        const tbody = document.getElementById('usersTable');
        const data = res.data || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No users found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function (u) {
            const statusBadge = u.status === 'online'
                ? '<span class="status-badge status-badge--online">Online</span>'
                : '<span class="status-badge status-badge--offline">Offline</span>';
            return '<tr>' +
                '<td class="username-cell">' + CyberGuardApp.escapeHtml(u.username) + '</td>' +
                '<td>' + CyberGuardApp.escapeHtml(u.email) + '</td>' +
                '<td>' + CyberGuardApp.escapeHtml(u.display_name || u.username) + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' + (u.created_at ? CyberGuardApp.formatDate(u.created_at) : '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    /* ---- Search ---- */
    function initSearch() {
        let timer;
        const abuserSearch = document.getElementById('abuserSearch');
        if (abuserSearch) abuserSearch.addEventListener('input', function () {
            clearTimeout(timer);
            const val = this.value.trim();
            timer = setTimeout(function () { loadAbusers(val); }, 300);
        });

        const blockedSearch = document.getElementById('blockedSearch');
        if (blockedSearch) blockedSearch.addEventListener('input', function () {
            clearTimeout(timer);
            const val = this.value.trim();
            timer = setTimeout(function () { loadBlockedMessages(val); }, 300);
        });

        const usersSearch = document.getElementById('usersSearch');
        if (usersSearch) usersSearch.addEventListener('input', function () {
            clearTimeout(timer);
            const val = this.value.trim();
            timer = setTimeout(function () { loadUsers(val); }, 300);
        });
    }

    return { init: init };
})();

window.Admin = Admin;

document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('.admin-layout')) {
        Admin.init();
    }
});
