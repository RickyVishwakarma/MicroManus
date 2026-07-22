"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODELS, PROVIDERS, type Provider } from "@/lib/models";

export function KeyForm({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("anthropic");
  const models = MODELS.filter((m) => m.provider === provider);
  const [model, setModel] = useState(models[0].id);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" | "pending" | "success" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  function pickProvider(p: Provider) {
    setProvider(p);
    setModel(MODELS.filter((m) => m.provider === p)[0].id);
    setBaseUrl("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "pending" });
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey: apiKey.trim(),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setState({ kind: "success" });
        router.push("/");
        router.refresh();
        return;
      }
      setState({
        kind: "error",
        message:
          data.message ?? "Could not save the key. Check it and try again.",
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error — check your connection and try again.",
      });
    }
  }

  const info = PROVIDERS[provider];

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-5">
      <div>
        <label className="text-sm font-medium">Provider</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => pickProvider(p)}
              className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                provider === p
                  ? "border-accent bg-accent-soft font-medium"
                  : "border-line bg-surface text-muted hover:text-foreground"
              }`}
            >
              {PROVIDERS[p].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="model" className="text-sm font-medium">
          Model
        </label>
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — ${m.pricing.input}/M in · ${m.pricing.output}/M out
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">
          Costs on the usage page are computed at this model&apos;s published
          rates, split by input / output / cached tokens.
        </p>
      </div>

      <div>
        <label htmlFor="apikey" className="text-sm font-medium">
          API key
        </label>
        <input
          id="apikey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={`${info.keyPrefix}…`}
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-muted">
          Get one at{" "}
          <a
            href={info.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            {info.keyUrl.replace("https://", "")}
          </a>
          . The key is validated with a tiny live call before it&apos;s saved.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-muted underline hover:text-foreground"
        >
          {showAdvanced ? "Hide" : "Show"} advanced (custom endpoint)
        </button>
        {showAdvanced && (
          <div className="mt-2">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={info.baseUrl}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-muted">
              Base URL for OpenAI-compatible proxies. Leave empty for the
              default: {info.baseUrl}
            </p>
          </div>
        )}
      </div>

      {state.kind === "error" && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </div>
      )}

      <button
        disabled={state.kind === "pending" || apiKey.trim().length < 8}
        className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.kind === "pending"
          ? "Validating key with a live call…"
          : state.kind === "success"
            ? "Key saved ✓"
            : hasExisting
              ? "Replace key"
              : "Validate & save key"}
      </button>
    </form>
  );
}
