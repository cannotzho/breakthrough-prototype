import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const REPO = 'cannotzho/breakthrough-prototype';

type Template = 'request_card_effect';

const TEMPLATES: { value: Template; label: string }[] = [
  { value: 'request_card_effect', label: 'Request New Card Effect' },
];

export default function IssueSubmitButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<Template | ''>('');
  const [effectName, setEffectName] = useState('');
  const [effectDescription, setEffectDescription] = useState('');

  const reset = () => {
    setName('');
    setTemplate('');
    setEffectName('');
    setEffectDescription('');
  };

  const handleSubmit = () => {
    if (!template) return;

    const title = `[Card Effect Request] ${effectName || 'Unnamed'}`;
    const body = [
      `**Submitted by:** ${name || 'Anonymous'}`,
      '',
      `**Effect Name:** ${effectName || 'None'}`,
      '',
      `**Effect Description:**`,
      effectDescription || '_No description provided._',
    ].join('\n');

    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent('card-effect-request')}`;
    window.open(url, '_blank');

    reset();
    setOpen(false);
  };

  const INPUT = 'text-sm bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-white w-full focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <>
      {/* Sticky icon button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 rounded-full bg-zinc-800 border border-zinc-600 hover:border-blue-500 text-zinc-400 hover:text-blue-400 flex items-center justify-center shadow-lg transition-colors"
        title="Submit an issue"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.25-1a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 7Zm.75 2.25a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
        </svg>
      </button>

      {/* Dialog */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-16 left-4 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Submit Issue</span>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-3 p-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Name</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className={INPUT}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Template</span>
                <select
                  value={template}
                  onChange={e => setTemplate(e.target.value as Template | '')}
                  className={INPUT}
                >
                  <option value="">Select a template…</option>
                  {TEMPLATES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              {template === 'request_card_effect' && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Effect Name</span>
                    <input
                      value={effectName}
                      onChange={e => setEffectName(e.target.value)}
                      placeholder="None"
                      className={INPUT}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Effect Description</span>
                    <textarea
                      value={effectDescription}
                      onChange={e => setEffectDescription(e.target.value)}
                      placeholder="A detailed description of the new card effect or mechanic"
                      rows={3}
                      className={`${INPUT} resize-y`}
                    />
                  </label>
                </>
              )}

              <button
                onClick={handleSubmit}
                disabled={!template}
                className={`text-sm px-4 py-2 rounded border transition-colors ${
                  template
                    ? 'border-blue-500 text-blue-400 hover:bg-blue-900'
                    : 'border-zinc-700 text-zinc-600 cursor-not-allowed'
                }`}
              >
                Open issue on GitHub
              </button>
              <p className="text-[10px] text-zinc-600 leading-snug">
                Opens a pre-filled GitHub issue form in a new tab. You'll need to confirm and submit on GitHub.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
