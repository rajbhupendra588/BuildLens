"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
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
import { apiRequest } from "@/lib/api";
import { AppSettings, TestConnectionResponse } from "@/types/settings";
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

  useEffect(() => {
    apiRequest<AppSettings>("/settings").then((data) => {
      setExistingSettings(data);
      setOllamaUrl(data["ollama_base_url"] ?? "");
    });
  }, []);

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
    try {
      const result = await apiRequest<TestConnectionResponse>(
        "/settings/test-connection",
        {
          method: "POST",
          body: JSON.stringify({
            provider: providerId,
            api_key: apiKeys[keyName] || undefined,
          }),
        },
      );
      setTestStatus((prev) => ({ ...prev, [providerId]: result }));

      // Auto-save the key on success only if the user entered a new one
      if (result.success && apiKeys[keyName]) {
        await apiRequest("/settings", {
          method: "PUT",
          body: JSON.stringify({ settings: { [keyName]: apiKeys[keyName] } }),
        });
        setExistingSettings((prev) => ({ ...prev, [keyName]: "****" }));
        setApiKeys((prev) => ({ ...prev, [keyName]: "" }));
        toast.success(`${providerId} API key saved`);
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
          Keys are saved automatically on successful test.
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

        {/* Default model */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Default Model</p>
          <ModelSelector />
        </div>
      </CardContent>
    </Card>
  );
}
