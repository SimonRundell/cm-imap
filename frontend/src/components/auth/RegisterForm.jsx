/**
 * @module components/auth/RegisterForm
 * @fileoverview Full-page registration form component.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '@/api/auth';

/**
 * Full-page registration form. Validates that the two password fields match
 * client-side, then calls the register API. On success, shows a confirmation
 * message and automatically redirects to /login after 2 seconds.
 * @returns {React.ReactElement}
 */
export default function RegisterForm() {
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Create Account</h1>
          <p className="text-slate-400 text-sm mt-1">Join CM-IMAP</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-800 rounded-2xl p-6 space-y-4 shadow-xl">
          {success && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
              Account created! Redirecting to login…
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {[
            { key: 'username', label: 'Username', type: 'text',     placeholder: 'johndoe' },
            { key: 'email',    label: 'Email',    type: 'email',    placeholder: 'john@example.com' },
            { key: 'password', label: 'Password', type: 'password', placeholder: '8+ characters' },
            { key: 'confirm',  label: 'Confirm',  type: 'password', placeholder: 'Repeat password' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input
                type={type}
                required
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-surface-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white
                           placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={placeholder}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium
                       py-2.5 rounded-lg transition-colors duration-150"
          >
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-slate-500 text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
