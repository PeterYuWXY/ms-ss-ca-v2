const API_BASE_URL = ''; // 使用相对路径，通过 Next.js rewrites 代理到 API 服务

export async function fetchAPI(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  // 获取响应内容类型
  const contentType = response.headers.get('content-type');
  
  // 检查是否是 JSON 响应
  if (!contentType || !contentType.includes('application/json')) {
    // 如果不是 JSON，读取文本内容用于错误提示
    const text = await response.text();
    console.error('API returned non-JSON response:', text.substring(0, 500));
    throw new Error(`API error: ${response.status} - ${text.substring(0, 200)}`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
  }

  return response.json();
}

// Skills API
export const skillsAPI = {
  list: () => fetchAPI('/api/v1/skills'),
  get: (id: string) => fetchAPI(`/api/v1/skills/${id}`),
};

// Campaigns API
export const campaignsAPI = {
  list: () => fetchAPI('/api/v1/campaigns'),
  get: (id: string) => fetchAPI(`/api/v1/campaigns/${id}`),
  create: (data: any) => fetchAPI('/api/v1/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  confirmPayment: (id: string, txHash: string) => 
    fetchAPI(`/api/v1/campaigns/${id}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    }),
};

// Communities API
export const communitiesAPI = {
  list: (params?: string) => fetchAPI(`/api/v1/communities${params ? `?${params}` : ''}`),
  get: (id: string) => fetchAPI(`/api/v1/communities/${id}`),
};

// Pricing API
export const pricingAPI = {
  calculate: (duration: string, count: number) => 
    fetchAPI(`/api/v1/pricing?duration=${duration}&communityCount=${count}`),
};
