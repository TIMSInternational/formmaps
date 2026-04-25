const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

export async function saveIsamsConfig(schoolId: string, payload: any) {
  const res = await fetch(`${API_BASE_URL}/api/v1/school-admin/integrations/isams?schoolId=${encodeURIComponent(schoolId)}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Failed to save iSAMS configuration");
  return res.json();
}

export async function getIsamsStatus(schoolId: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/school-admin/integrations/isams/status?schoolId=${encodeURIComponent(schoolId)}`, {
    headers: getHeaders(),
  });

  if (!res.ok) return { connected: false };
  return res.json();
}

export async function triggerIsamsSync(schoolId: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/school-admin/integrations/isams/sync?schoolId=${encodeURIComponent(schoolId)}`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) throw new Error("Failed to trigger iSAMS sync");
  return res.json();
}
