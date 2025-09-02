import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalStorageService {
   private readonly baseDir: string;
  private readonly publicPrefix: string;

  constructor() {
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (nodeEnv === 'production') {
      this.baseDir = path.join(process.env.SERVER_ABSOLUTE_PATH || process.cwd(), 'files');
      this.publicPrefix = '/files/';
    } else {
      this.baseDir = path.resolve('storage');
      this.publicPrefix = '/files/';
    }
  }

  private ensureDirExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

    async uploadFile(
    file: Buffer,
    fileName: string,
    _bucket: string = 'default',
    _isPrivate: boolean = false,
  ) {
    const targetPath = path.join(this.baseDir, fileName);
    this.ensureDirExists(path.dirname(targetPath));
    await fs.promises.writeFile(targetPath, file);
    return this.getPublicUrl(fileName);
  }

   async getFile(fileName: string, _bucket: string = 'default') {
    const targetPath = path.join(this.baseDir, fileName);
    if (!fs.existsSync(targetPath)) {
      throw new Error('File not found');
    }
    return fs.promises.readFile(targetPath);
  }

  async getPublicUrl(fileName: string, _bucket: string = 'default') {
    return `${this.publicPrefix}${fileName}`;
  }

  async resolveFromPublicUrl(publicUrl: string) {
    try {
      const parsed = new URL(publicUrl, 'http://localhost');
      const pathname = parsed.pathname;
      if (!pathname.startsWith(this.publicPrefix)) {
        throw new Error('Invalid public URL');
      }
      const relative = pathname.substring(this.publicPrefix.length);
      return path.join(this.baseDir, relative);
    } catch {
      if (publicUrl.startsWith(this.publicPrefix)) {
        const relative = publicUrl.substring(this.publicPrefix.length);
        return path.join(this.baseDir, relative);
      }
      throw new Error('Invalid public URL');
    }
  }
}