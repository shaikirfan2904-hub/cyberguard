/**
 * CyberGuard AI — Authentication JS
 * Handles login and registration forms.
 */

const Auth = (function () {
    'use strict';

    /* =========================================================
       Shared helpers
    ========================================================= */

    function showFieldError(msg) {
        const el = document.getElementById('formError');

        if (el) {
            el.textContent = msg || '';
            el.style.display = msg ? 'block' : '';
        }
    }

    function setLoading(loading) {
        const btn = document.getElementById('submitBtn');

        if (!btn) return;

        if (loading) {
            btn.classList.add('is-loading');
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
        } else {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
        }
    }

    function getInput(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    /* =========================================================
       Login
       ========================================================= */

    function initLogin() {
        const form = document.getElementById('loginForm');

        if (!form) return;

        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            showFieldError('');
            setLoading(true);

            try {
                const username = getInput('username').trim();
                const password = getInput('password');

                /* Validation */
                if (!username || !password) {
                    showFieldError(
                        'Please enter your username and password.'
                    );
                    return;
                }

                const res = await CyberGuardApp.api(
                    '/api/auth/login',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            username: username,
                            password: password
                        })
                    }
                );

                if (res && res.success) {
                    CyberGuardApp.toast(
                        'Welcome back!',
                        'success'
                    );

                    setTimeout(function () {
                        window.location.href = '/dashboard';
                    }, 500);

                    return;
                }

                showFieldError(
                    (res && res.message) ||
                    'Login failed. Please check your credentials.'
                );

            } catch (error) {
                console.error('[Auth] Login error:', error);

                showFieldError(
                    'Something went wrong. Please try again.'
                );

            } finally {
                setLoading(false);
            }
        });
    }

    /* =========================================================
       Register
       ========================================================= */

    function initRegister() {
        const form = document.getElementById('registerForm');

        if (!form) return;

        /* Password strength */
        const pwInput = document.getElementById('password');

        if (pwInput) {
            pwInput.addEventListener('input', function () {
                updatePasswordStrength(this.value);
            });

            /* Show initial empty state */
            updatePasswordStrength('');
        }

        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            showFieldError('');
            setLoading(true);

            try {
                const username = getInput('username').trim();
                const email = getInput('email').trim();
                const password = getInput('password');
                const confirmPw = getInput('confirm_password');

                /* Required fields */
                if (
                    !username ||
                    !email ||
                    !password ||
                    !confirmPw
                ) {
                    showFieldError(
                        'All fields are required.'
                    );
                    return;
                }

                /* Username */
                if (username.length < 3) {
                    showFieldError(
                        'Username must contain at least 3 characters.'
                    );
                    return;
                }

                /* Email */
                const emailPattern =
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                if (!emailPattern.test(email)) {
                    showFieldError(
                        'Please enter a valid email address.'
                    );
                    return;
                }

                /* Password */
                if (password.length < 8) {
                    showFieldError(
                        'Password must contain at least 8 characters.'
                    );
                    return;
                }

                /* Confirm password */
                if (password !== confirmPw) {
                    showFieldError(
                        'Passwords do not match.'
                    );
                    return;
                }

                const res = await CyberGuardApp.api(
                    '/api/auth/register',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            username: username,
                            email: email,
                            password: password,
                            confirm_password: confirmPw
                        })
                    }
                );

                if (res && res.success) {
                    CyberGuardApp.toast(
                        'Account created! Please sign in.',
                        'success'
                    );

                    setTimeout(function () {
                        window.location.href = '/login';
                    }, 1000);

                    return;
                }

                showFieldError(
                    (res && res.message) ||
                    'Registration failed. Please try again.'
                );

            } catch (error) {
                console.error(
                    '[Auth] Registration error:',
                    error
                );

                showFieldError(
                    'Something went wrong. Please try again.'
                );

            } finally {
                setLoading(false);
            }
        });
    }

    /* =========================================================
       Password strength
       ========================================================= */

    function updatePasswordStrength(pw) {
        const fill =
            document.querySelector('.strength-fill');

        const text =
            document.querySelector('.strength-text');

        if (!fill || !text) return;

        let score = 0;

        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        const levels = [
            {
                w: '0%',
                c: '#5A6B7A',
                t: ''
            },
            {
                w: '25%',
                c: '#FF5252',
                t: 'Weak'
            },
            {
                w: '50%',
                c: '#FFB300',
                t: 'Fair'
            },
            {
                w: '75%',
                c: '#00E676',
                t: 'Good'
            },
            {
                w: '100%',
                c: '#00D4FF',
                t: 'Strong'
            },
            {
                w: '100%',
                c: '#00D4FF',
                t: 'Very strong'
            }
        ];

        const level = levels[score];

        fill.style.width = level.w;
        fill.style.background = level.c;

        text.textContent = level.t;
        text.style.color = level.c;
    }

    /* =========================================================
       Public API
       ========================================================= */

    return {
        initLogin: initLogin,
        initRegister: initRegister
    };

})();

window.Auth = Auth;
