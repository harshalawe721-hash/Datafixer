"use client";

import { useId, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

const topics = ["General question", "Report a problem", "Feature request", "Privacy question"] as const;

const fieldClass =
  "mt-1.5 block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-ring/40";

/**
 * Composes an email in the visitor's own mail app (mailto:). Nothing is sent
 * through DataFixer's servers, so no message data is stored by us.
 */
export function ContactForm({ email }: { email: string }) {
  const id = useId();
  const [topic, setTopic] = useState<string>(topics[0]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) {
      setError("Please write a message of at least 10 characters.");
      return;
    }
    setError(null);
    const subject = encodeURIComponent(`DataFixer: ${topic}`);
    const body = encodeURIComponent(message.trim());
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="not-prose space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div>
        <label htmlFor={`${id}-topic`} className="text-sm font-medium">
          Topic
        </label>
        <select id={`${id}-topic`} value={topic} onChange={(e) => setTopic(e.target.value)} className={fieldClass}>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="text-sm font-medium">
          Message
        </label>
        <textarea
          id={`${id}-message`}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={fieldClass}
          placeholder="How can we help? Please don't paste confidential spreadsheet data."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
            This opens your email app with the message ready to send.
          </p>
        )}
      </div>
      <Button type="submit">
        <Mail className="size-4" aria-hidden="true" />
        Write email
      </Button>
    </form>
  );
}
