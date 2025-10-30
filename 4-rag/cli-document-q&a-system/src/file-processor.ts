import fs from 'fs-extra';
import * as path from 'path';

export interface ProcessedFile {
  path: string;
  content: string;
  type: string;
  size: number;
  lastModified: Date;
}

export class FileProcessor {
  private supportedExtensions = ['.txt', '.md', '.json'];

  async processFile(filePath: string): Promise<ProcessedFile | null> {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      if (!this.supportedExtensions.includes(ext)) {
        console.warn(`⚠️ Skipping unsupported file type: ${filePath}`);
        return null;
      }

      let content: string;

      switch (ext) {
        case '.json':
          const jsonData = await fs.readJson(filePath);
          content = this.extractTextFromJson(jsonData);
          break;
        default:
          content = await fs.readFile(filePath, 'utf-8');
      }

      if (content.trim().length === 0) {
        console.warn(`⚠️ Skipping empty file: ${filePath}`);
        return null;
      }

      return {
        path: filePath,
        content: content.trim(),
        type: ext.slice(1), // Remove the dot
        size: stats.size,
        lastModified: stats.mtime
      };

    } catch (error) {
      console.error(`❌ Error processing file ${filePath}:`, error);
      return null;
    }
  }

  private extractTextFromJson(data: any): string {
    const textParts: string[] = [];

    const extractText = (obj: any, prefix: string = ''): void => {
      if (typeof obj === 'string') {
        textParts.push(obj);
      } else if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => extractText(item, `${prefix}[${index}]`));
        } else {
          Object.entries(obj).forEach(([key, value]) => {
            const newPrefix = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'string' && value.length > 10) {
              textParts.push(`${key}: ${value}`);
            } else {
              extractText(value, newPrefix);
            }
          });
        }
      }
    };

    extractText(data);
    return textParts.join('\n\n');
  }

  async processDirectory(dirPath: string, recursive: boolean = true): Promise<ProcessedFile[]> {
    const files: ProcessedFile[] = [];

    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && recursive) {
          const subFiles = await this.processDirectory(itemPath, recursive);
          files.push(...subFiles);
        } else if (stats.isFile()) {
          const processedFile = await this.processFile(itemPath);
          if (processedFile) {
            files.push(processedFile);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing directory ${dirPath}:`, error);
    }

    return files;
  }
}
