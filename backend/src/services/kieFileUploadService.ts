import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_UPLOAD_BASE_URL = 'https://kieai.redpandaai.co';
const DEFAULT_UPLOAD_PATH = 'images/user-uploads';

type KieUploadResponse = {
    success?: boolean;
    code?: number;
    msg?: string;
    data?: {
        fileName?: string;
        filePath?: string;
        fileUrl?: string;
        downloadUrl?: string;
    };
};

export interface KieUploadOptions {
    base64Data: string;
    fileName?: string;
    uploadPath?: string;
}

export interface KieUploadResult {
    fileName: string;
    filePath: string;
    fileUrl: string;
    downloadUrl: string;
}

class KieFileUploadService {
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly client: AxiosInstance;

    constructor() {
        this.apiKey = process.env.KIE_API_KEY || process.env.KIE_IMAGE_API_KEY || '';
        this.baseURL = (process.env.KIE_UPLOAD_BASE_URL || DEFAULT_UPLOAD_BASE_URL).replace(/\/$/, '');
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000
        });
    }

    isConfigured() {
        return !!this.apiKey;
    }

    async uploadBase64(options: KieUploadOptions): Promise<KieUploadResult> {
        if (!this.isConfigured()) {
            throw new Error('KIE_CLIENT_NOT_INITIALIZED');
        }

        const base64Data = options.base64Data?.trim();
        if (!base64Data) {
            throw new Error('KIE_UPLOAD_BASE64_REQUIRED');
        }

        const response = await this.client.post<KieUploadResponse>(
            '/api/file-base64-upload',
            {
                base64Data,
                uploadPath: options.uploadPath || DEFAULT_UPLOAD_PATH,
                fileName: options.fileName
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const payload = response.data;
        if (!payload?.success && payload?.code !== 200) {
            throw new Error(payload?.msg || 'KIE_UPLOAD_FAILED');
        }

        const data = payload.data;
        const fileUrl = data?.fileUrl || data?.downloadUrl || '';
        const downloadUrl = data?.downloadUrl || data?.fileUrl || '';
        const fileName = data?.fileName || options.fileName || 'uploaded-image';
        const filePath = data?.filePath || options.uploadPath || DEFAULT_UPLOAD_PATH;

        if (!fileUrl || !downloadUrl) {
            throw new Error('KIE_UPLOAD_RESPONSE_MISSING_URL');
        }

        return {
            fileName,
            filePath,
            fileUrl,
            downloadUrl
        };
    }
}

export const kieFileUploadService = new KieFileUploadService();
