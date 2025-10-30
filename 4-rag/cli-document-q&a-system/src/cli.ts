import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import fs from 'fs-extra';
import { PostgreSQLDocumentManager } from './document-manager';
import { FileProcessor } from './file-processor';
import 'dotenv/config';

const program = new Command();

program
.name('doc-qa')
.description('CLI Document Question & Answer System using PostgreSQL RAG')
.version('1.0.0');

const documentManager = new PostgreSQLDocumentManager();
const fileProcessor = new FileProcessor();

// Ensure proper cleanup on exit
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🔄 Cleaning up...'));
  await documentManager.disconnect();
  process.exit(0);
});

program
.command('ingest')
.description('Ingest documents from files or directories into PostgreSQL')
.argument('<path>', 'File or directory path to ingest')
.option('-r, --recursive', 'Process directories recursively', true)
.option('-t, --type <type>', 'Filter by file type (txt, md, json)')
.action(async (inputPath, options) => {
  const spinner = ora('Connecting to PostgreSQL database...').start();

  try {
    await documentManager.connect();
    spinner.succeed('Connected to PostgreSQL database');

    // Check if path exists
    if (!(await fs.pathExists(inputPath))) {
      spinner.fail(`Path does not exist: ${inputPath}`);
      return;
    }

    spinner.start('Discovering files...');
    const stats = await fs.stat(inputPath);
    let files;

    if (stats.isFile()) {
      const file = await fileProcessor.processFile(inputPath);
      files = file ? [file] : [];
    } else {
      files = await fileProcessor.processDirectory(inputPath, options.recursive);
    }

    // Filter by type if specified
    if (options.type) {
      files = files.filter(f => f.type === options.type);
    }

    if (files.length === 0) {
      spinner.warn('No valid files found to process');
      return;
    }

    spinner.succeed(`Found ${files.length} files to process`);

    // Process files
    console.log(chalk.blue('\n📄 Processing documents...\n'));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = `(${i + 1}/${files.length})`;
      console.log(chalk.gray(progress), `Processing ${file.path}...`);
      await documentManager.ingestFile(file);
    }

    // Show final stats
    const finalStats = await documentManager.getStats();
    console.log(chalk.green('\n✅ Ingestion complete!'));
    console.log(chalk.blue(`📊 Total chunks: ${finalStats.totalChunks}`));
    console.log(chalk.blue(`📁 Documents: ${finalStats.totalDocuments}`));
    console.log(chalk.blue(`📋 File types: ${finalStats.fileTypes.join(', ')}`));

  } catch (error) {
    spinner.fail('Ingestion failed');
    console.error(chalk.red('❌ Error:'), error);
  } finally {
    await documentManager.disconnect();
  }
});

program
.command('query')
.description('Ask a question about the ingested documents')
.argument('<question>', 'Question to ask')
.action(async (question) => {
  const spinner = ora('Connecting to PostgreSQL database...').start();

  try {
    await documentManager.connect();

    const stats = await documentManager.getStats();
    if (stats.totalChunks === 0) {
      spinner.fail('No documents found in database. Please ingest documents first.');
      return;
    }

    spinner.text = 'Processing question with PostgreSQL similarity search...';
    const answer = await documentManager.askQuestion(question);
    spinner.stop();

    console.log(chalk.blue('\n🤔 Question:'), question);
    console.log(chalk.green('\n🤖 Answer:'));
    console.log(answer);

  } catch (error) {
    spinner.fail('Query failed');
    console.error(chalk.red('❌ Error:'), error);
  } finally {
    await documentManager.disconnect();
  }
});

program
.command('interactive')
.description('Start an interactive Q&A session')
.alias('chat')
.action(async () => {
  const spinner = ora('Connecting to PostgreSQL database...').start();

  try {
    await documentManager.connect();

    const stats = await documentManager.getStats();
    if (stats.totalChunks === 0) {
      spinner.fail('No documents found in database. Please ingest documents first.');
      return;
    }

    spinner.succeed('Connected to PostgreSQL database');

    console.log(chalk.blue('\n🎯 Interactive Document Q&A Session (PostgreSQL Backend)'));
    console.log(chalk.gray(`📊 ${stats.totalChunks} chunks from ${stats.totalDocuments} documents`));
    console.log(chalk.gray('💡 Type "quit", "exit", or press Ctrl+C to end\n'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = async (): Promise<void> => {
      rl.question(chalk.cyan('❓ Your question: '), async (question) => {
        if (!question.trim()) {
          console.log(chalk.yellow('Please enter a question.\n'));
          askQuestion();
          return;
        }

        if (['quit', 'exit', 'q'].includes(question.toLowerCase().trim())) {
          console.log(chalk.blue('\n👋 Thanks for using the Document Q&A system!'));
          rl.close();
          await documentManager.disconnect();
          return;
        }

        console.log(chalk.gray('🤔 Searching PostgreSQL database...'));

        try {
          const answer = await documentManager.askQuestion(question);
          console.log(chalk.green('\n🤖 Answer:'));
          console.log(answer);
          console.log(chalk.gray('\n──────────────────────────────────────────────\n'));
        } catch (error) {
          console.error(chalk.red('❌ Error processing question:'), error);
        }

        askQuestion();
      });
    };

    askQuestion();
  } catch (error) {
    spinner.fail('Failed to start interactive session');
    console.error(chalk.red('❌ Error:'), error);
  }
});

program
.command('stats')
.description('Show statistics about the PostgreSQL document database')
.alias('status')
.action(async () => {
  const spinner = ora('Connecting to PostgreSQL database...').start();

  try {
    await documentManager.connect();
    const stats = await documentManager.getStats();

    spinner.stop();
    console.log(chalk.blue('\n📊 Document Database Statistics'));
    console.log(chalk.gray('───────────────────────────────'));
    console.log(chalk.green(`📁 Documents:`), stats.totalDocuments);
    console.log(chalk.green(`🔢 Total chunks:`), stats.totalChunks);
    console.log(chalk.green(`📋 File types:`), stats.fileTypes.join(', ') || 'None');
    console.log(chalk.green(`🕒 Last updated:`), stats.lastUpdated || 'Never');
  } catch (error) {
    spinner.fail('Failed to fetch statistics');
    console.error(chalk.red('❌ Error:'), error);
  } finally {
    await documentManager.disconnect();
  }
});

program
.command('clear')
.description('Clear all documents from the PostgreSQL database')
.action(async () => {
  const spinner = ora('Connecting to PostgreSQL database...').start();

  try {
    await documentManager.connect();

    spinner.text = 'Clearing all document data...';
    await documentManager.clearDatabase();
    spinner.succeed('Database cleared successfully');
  } catch (error) {
    spinner.fail('Failed to clear database');
    console.error(chalk.red('❌ Error:'), error);
  } finally {
    await documentManager.disconnect();
  }
});

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parseAsync(process.argv);
