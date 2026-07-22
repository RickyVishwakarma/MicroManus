import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { validateKey, LLMError } from "@/lib/llm";
import { getModel, PROVIDERS, type Provider } from "@/lib/models";

const bodySchema = z.object({
  provider: z.enum(["openai", "anthropic", "moonshot"]),
  model: z.string().min(1),
  apiKey: z.string().min(8).max(500),
  baseUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Check the form fields and try again." },
      { status: 400 }
    );

  const { provider, model, apiKey } = parsed.data;
  const modelInfo = getModel(model);
  if (!modelInfo || modelInfo.provider !== provider)
    return NextResponse.json(
      { error: "invalid_input", message: "Pick a model from the list." },
      { status: 400 }
    );

  const baseUrl = parsed.data.baseUrl || PROVIDERS[provider as Provider].baseUrl;

  // Live validation — a bad key must fail HERE with a clear message,
  // not later in the middle of an agent run.
  try {
    await validateKey({ provider, baseUrl, apiKey, model });
  } catch (err) {
    const message =
      err instanceof LLMError
        ? err.message
        : "Could not validate the key against the provider.";
    return NextResponse.json({ error: "key_invalid", message }, { status: 400 });
  }

  const admin = createAdminClient();
  const upsert = await admin.from("api_keys").upsert({
    user_id: user.id,
    provider,
    base_url: baseUrl,
    model,
    encrypted_key: encrypt(apiKey),
    key_hint: apiKey.slice(-4),
    updated_at: new Date().toISOString(),
  });
  if (upsert.error) {
    console.error("api_keys upsert failed:", upsert.error);
    return NextResponse.json(
      { error: "server_error", message: "Could not save the key. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, hint: apiKey.slice(-4) });
}
