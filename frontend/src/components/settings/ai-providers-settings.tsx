"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ApiError, apiRequest, logApiError } from "@/lib/api";
import { notifyModelsChanged } from "@/lib/chat-models";
import { AppSettings, TestConnectionResponse } from "@/types/settings";
import { ModelItem } from "@/types/chat";
import { toast } from "sonner";
import { ModelSelector } from "@/components/chat/model-selector";

const CLOUD_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    keyName: "openai_api_key",
    placeholder: "sk-...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyName: "anthropic_api_key",
    placeholder: "sk-ant-...",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keyName: "gemini_api_key",
    placeholder: "AIza...",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyName: "openrouter_api_key",
    placeholder: "sk-or-...",
  },
  { id: "zai", label: "Z.AI", keyName: "zai_api_key", placeholder: "API key" },
  {
    id: "moonshot",
    label: "Moonshot AI",
    keyName: "moonshot_api_key",
    placeholder: "API key",
  },
  {
    id: "minimax",
    label: "MiniMax",
    keyName: "minimax_api_key",
    placeholder: "API key",
  },
];

const MODEL_PROVIDERS = [
  { id: "ollama", label: "Ollama (Local)" },
  ...CLOUD_PROVIDERS.map(({ id, label }) => ({ id, label })),
];

const PROVIDER_LABELS = Object.fromEntries(
  MODEL_PROVIDERS.map(({ id, label }) => [id, label]),
);

function ConnectionStatus({
  result,
}: {
  result: TestConnectionResponse | null;
}) {
  if (!result) return null;
  return (
    <span
      className={`flex items-center gap-1 text-xs mt-1 ${result.success ? "text-green-600" : "text-destructive"}`}
    >
      {result.success ? (
        <CheckCircle className="size-3" />
      ) : (
        <XCircle className="size-3" />
      )}
      {result.message}
    </span>
  );
}

export function AiProvidersSettings() {
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaStatus, setOllamaStatus] =
    useState<TestConnectionResponse | null>(null);
  const [ollamaTesting, setOllamaTesting] = useState(false);

  const [existingSettings, setExistingSettings] = useState<AppSettings>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<
    Record<string, TestConnectionResponse | null>
  >({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [customModels, setCustomModels] = useState<ModelItem[]>([]);
  const [newProvider, setNewProvider] = useState(MODEL_PROVIDERS[0].id);
  const [newModelName, setNewModelName] = useState("");
  const [savingModel, setSavingModel] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const loadCustomModels = () => {
    apiRequest<{ models: ModelItem[] }>("/models/custom")
      .then((data) => setCustomModels(data.models ?? []))
      .catch((error) => {
        logApiError("Failed to load custom models", error);
      });
  };

  useEffect(() => {
    apiRequest<AppSettings>("/settings")
      .then((data) => {
        setExistingSettings(data);
        setOllamaUrl(data["ollama_base_url"] ?? "");
      })
      .catch((error) => {
        logApiError("Failed to load provider settings", error);
      });
    loadCustomModels();
  }, []);

  const addModel = async () => {
    const name = newModelName.trim();
    if (!name) return;
    setSavingModel(true);
    try {
      const data = await apiRequest<{ models: ModelItem[] }>("/models/custom", {
        method: "POST",
        body: JSON.stringify({ provider: newProvider, name }),
      });
      setCustomModels(data.models ?? []);
      setNewModelName("");
      notifyModelsChanged();
      toast.success("Model added");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Could not add model";
      toast.error(message);
    } finally {
      setSavingModel(false);
    }
  };

  const removeModel = async (model: ModelItem) => {
    const key = `${model.provider}:${model.name}`;
    setRemovingKey(key);
    try {
      const data = await apiRequest<{ models: ModelItem[] }>("/models/custom", {
        method: "DELETE",
        body: JSON.stringify({ provider: model.provider, name: model.name }),
      });
      setCustomModels(data.models ?? []);
      notifyModelsChanged();
      toast.success("Model removed");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Could not remove model";
      toast.error(message);
    } finally {
      setRemovingKey(null);
    }
  };

  const testOllama = async () => {
    setOllamaTesting(true);
    setOllamaStatus(null);
    try {
      const result = await apiRequest<TestConnectionResponse>(
        "/settings/test-connection",
        {
          method: "POST",
          body: JSON.stringify({ provider: "ollama", base_url: ollamaUrl }),
        },
      );
      setOllamaStatus(result);
      if (result.success) {
        await apiRequest("/settings", {
          method: "PUT",
          body: JSON.stringify({ settings: { ollama_base_url: ollamaUrl } }),
        });
        toast.success("Ollama URL saved");
      }
    } catch {
      setOllamaStatus({ success: false, message: "Request failed" });
    } finally {
      setOllamaTesting(false);
    }
  };

  const testProvider = async (providerId: string, keyName: string) => {
    setTesting((prev) => ({ ...prev, [providerId]: true }));
    setTestStatus((prev) => ({ ...prev, [providerId]: null }));
    const typedKey = (apiKeys[keyName] || "").trim();
    try {
      const result = await apiRequest<TestConnectionResponse>(
        "/settings/test-connection",
        {
          method: "POST",
          body: JSON.stringify({
            provider: providerId,
            api_key: typedKey || undefined,
          }),
        },
      );
      setTestStatus((prev) => ({ ...prev, [providerId]: result }));

      if (result.saved) {
        setExistingSettings((prev) => ({ ...prev, [keyName]: "****" }));
        setApiKeys((prev) => ({ ...prev, [keyName]: "" }));
      }

      // Other providers still save from the UI after a successful test.
      if (result.success && typedKey && !result.saved) {
        await apiRequest("/settings", {
          method: "PUT",
          body: JSON.stringify({ settings: { [keyName]: typedKey } }),
        });
        setExistingSettings((prev) => ({ ...prev, [keyName]: "****" }));
        setApiKeys((prev) => ({ ...prev, [keyName]: "" }));
        toast.success(`${providerId} API key saved`);
      } else if (result.success) {
        toast.success(result.message);
      } else if (result.saved) {
        toast.error(result.message);
      }
    } catch {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { success: false, message: "Request failed" },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Providers</CardTitle>
        <CardDescription>
          Configure connection details for local and cloud LLM providers.
          Keys are saved automatically on successful test. Add model ids
          that should appear in the model picker.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ollama */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Ollama (Local)</p>
          <div className="flex gap-2">
            <Input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="flex-1"
              autoComplete="off"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={testOllama}
              disabled={ollamaTesting}
            >
              {ollamaTesting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Test & Save"
              )}
            </Button>
          </div>
          <ConnectionStatus result={ollamaStatus} />
        </div>

        <Separator />

        {/* Cloud providers */}
        <div className="space-y-4">
          <p className="text-sm font-medium">Cloud Providers</p>
          {CLOUD_PROVIDERS.map(({ id, label, keyName, placeholder }) => (
            <div key={id} className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{label}</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    autoComplete="off"
                    type={showKey[keyName] ? "text" : "password"}
                    value={apiKeys[keyName] ?? ""}
                    onChange={(e) =>
                      setApiKeys((prev) => ({
                        ...prev,
                        [keyName]: e.target.value,
                      }))
                    }
                    placeholder={
                      existingSettings[keyName] === "****"
                        ? "Configured (enter to replace)"
                        : placeholder
                    }
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowKey((prev) => ({
                        ...prev,
                        [keyName]: !prev[keyName],
                      }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey[keyName] ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testProvider(id, keyName)}
                  disabled={testing[id]}
                >
                  {testing[id] ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Test & Save"
                  )}
                </Button>
              </div>
              <ConnectionStatus result={testStatus[id] ?? null} />
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Models</p>
            <p className="text-xs text-muted-foreground">
              Add a model id for a provider, such as gpt-4o or
              apodex/apodex-1.1-mini:free. Free OpenRouter models need the
              :free suffix.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:w-44"
            >
              {MODEL_PROVIDERS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addModel();
                }
              }}
              placeholder="Model id"
              className="flex-1"
              autoComplete="off"
            />
            <Button
              size="sm"
              onClick={() => void addModel()}
              disabled={savingModel || !newModelName.trim()}
            >
              {savingModel ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add
            </Button>
          </div>
          {customModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No extra models yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {customModels.map((model) => {
                const key = `${model.provider}:${model.name}`;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="text-muted-foreground">
                        {PROVIDER_LABELS[model.provider] ?? model.provider}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      {model.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${model.name}`}
                      onClick={() => void removeModel(model)}
                      disabled={removingKey === key}
                    >
                      {removingKey === key ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Separator />

        {/* Default model */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Default Model</p>
          <ModelSelector restrictToChatModels={false} />
        </div>
      </CardContent>
    </Card>
  );
}
