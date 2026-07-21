export interface ProviderOfficialLinks {
  websiteUrl: string;
  apiKeyUrl: string;
}

const PROVIDER_OFFICIAL_LINKS: Readonly<Record<string, ProviderOfficialLinks>> = {
  agnes: {
    websiteUrl: "https://agnes-ai.com",
    apiKeyUrl: "https://platform.agnes-ai.com",
  },
  deepseek: {
    websiteUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
  },
  zhipu: {
    websiteUrl: "https://bigmodel.cn",
    apiKeyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
  },
  google: {
    websiteUrl: "https://ai.google.dev/gemini-api",
    apiKeyUrl: "https://aistudio.google.com/api-keys",
  },
};

export function findProviderOfficialLinks(providerId: string): ProviderOfficialLinks | undefined {
  return PROVIDER_OFFICIAL_LINKS[providerId.trim().toLowerCase()];
}
