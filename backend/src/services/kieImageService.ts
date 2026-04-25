import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BASE_URL = 'https://api.kie.ai';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
const GENERATE_PATH = '/api/v1/gpt4o-image/generate';
const STATUS_PATH = '/api/v1/gpt4o-image/record-info';

export type KieImageSize = '1:1' | '3:2' | '2:3';

export interface KieImageGenerateOptions {
    prompt: string;
    size?: KieImageSize;
    nVariants?: number;
    isEnhance?: boolean;
    filesUrl?: string[];
    maskUrl?: string;
    waitForCompletion?: boolean;
    pollIntervalMs?: number;
    timeoutMs?: number;
}

export interface KieImageTaskRecord {
    taskId: string;
    paramJson: Record<string, unknown> | null;
    completeTime: string | null;
    resultUrls: string[];
    successFlag: number;
    errorCode: number | null;
    errorMessage: string | null;
    createTime: string;
    progress: string;
    raw: Record<string, unknown>;
}

export interface KieImageServiceStatus {
    configured: boolean;
    baseURL: string;
    authConfigured: boolean;
}

type KieImageApiEnvelope<T> = {
    code?: number;
    msg?: string;
    data?: T;
};

type KieImageGenerateData = {
    taskId?: string;
};

type KieImageStatusData = {
    taskId: string;
    paramJson?: string | Record<string, unknown> | null;
    completeTime?: string | null;
    response?: {
        result_urls?: string[];
    } | null;
    successFlag?: number;
    errorCode?: number | null;
    errorMessage?: string | null;
    createTime?: string;
    progress?: string;
};

class KieImageService {
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly client: AxiosInstance;

    constructor() {
        this.apiKey = process.env.KIE_API_KEY || process.env.KIE_IMAGE_API_KEY || '';
        this.baseURL = (process.env.KIE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000
        });
    }

    getStatus(): KieImageServiceStatus {
        return {
            configured: this.isConfigured(),
            baseURL: this.baseURL,
            authConfigured: this.isConfigured()
        };
    }

    isConfigured() {
        return !!this.apiKey;
    }

    async generate4oImage(options: KieImageGenerateOptions): Promise<KieImageTaskRecord> {
        this.assertConfigured();

        const prompt = options.prompt?.trim();
        if (!prompt) {
            throw new Error('KIE_IMAGE_PROMPT_REQUIRED');
        }

        const payload: Record<string, unknown> = {
            prompt
        };

        if (options.size) payload.size = options.size;
        if (typeof options.nVariants === 'number') payload.nVariants = options.nVariants;
        if (typeof options.isEnhance === 'boolean') payload.isEnhance = options.isEnhance;
        if (Array.isArray(options.filesUrl) && options.filesUrl.length > 0) payload.filesUrl = options.filesUrl;
        if (options.maskUrl) payload.maskUrl = options.maskUrl;

        const generateResponse = await this.request<KieImageApiEnvelope<KieImageGenerateData>>(
            'post',
            GENERATE_PATH,
            payload
        );
        const taskId = generateResponse.data?.taskId;

        if (!taskId) {
            throw new Error('KIE_IMAGE_TASK_ID_MISSING');
        }

        if (options.waitForCompletion === false) {
            return {
                taskId,
                paramJson: null,
                completeTime: null,
                resultUrls: [],
                successFlag: 0,
                errorCode: null,
                errorMessage: null,
                createTime: new Date().toISOString(),
                progress: '0.00',
                raw: {
                    taskId
                }
            };
        }

        return this.pollTask(taskId, options.pollIntervalMs, options.timeoutMs);
    }

    async getImageTask(taskId: string): Promise<KieImageTaskRecord> {
        this.assertConfigured();

        const normalizedTaskId = taskId.trim();
        if (!normalizedTaskId) {
            throw new Error('KIE_IMAGE_TASK_ID_REQUIRED');
        }

        const response = await this.request<KieImageApiEnvelope<KieImageStatusData>>(
            'get',
            `${STATUS_PATH}?taskId=${encodeURIComponent(normalizedTaskId)}`
        );

        const data = response.data;
        if (!data) {
            throw new Error('KIE_IMAGE_STATUS_EMPTY');
        }

        return this.normalizeTask(data);
    }

    private async pollTask(
        taskId: string,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<KieImageTaskRecord> {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const record = await this.getImageTask(taskId);
            if (record.successFlag === 1) {
                return record;
            }

            if (record.successFlag === 2) {
                throw new Error(record.errorMessage || 'KIE_IMAGE_GENERATION_FAILED');
            }

            await this.sleep(pollIntervalMs);
        }

        throw new Error('KIE_IMAGE_GENERATION_TIMEOUT');
    }

    private normalizeTask(data: KieImageStatusData): KieImageTaskRecord {
        const paramJson = this.parseJson(data.paramJson);
        const resultUrls = data.response?.result_urls || [];

        return {
            taskId: data.taskId,
            paramJson,
            completeTime: data.completeTime || null,
            resultUrls,
            successFlag: typeof data.successFlag === 'number' ? data.successFlag : 0,
            errorCode: typeof data.errorCode === 'number' ? data.errorCode : null,
            errorMessage: data.errorMessage || null,
            createTime: data.createTime || new Date().toISOString(),
            progress: data.progress || '0.00',
            raw: {
                ...data,
                response: data.response || null
            }
        };
    }

    private parseJson(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> | null {
        if (!value) return null;
        if (typeof value === 'object') return value;

        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
        } catch {
            return null;
        }
    }

    private async request<T>(method: 'get' | 'post', url: string, data?: Record<string, unknown>) {
        const response = await this.client.request<T>({
            method,
            url,
            data,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    }

    private assertConfigured() {
        if (!this.isConfigured()) {
            throw new Error('KIE_CLIENT_NOT_INITIALIZED');
        }
    }

    private sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const kieImageService = new KieImageService();
