import { MetadataCache, TFile, Vault } from 'obsidian';

type TaskDirective = 'include' | 'exclude';

export class TaskFileFilter {
  constructor(private vault: Vault, private metadataCache: MetadataCache) {}

  shouldInclude(file: TFile): boolean {
    for (const candidate of this.getCandidates(file)) {
      const directive = this.getDirective(candidate);
      if (directive) return directive === 'include';
    }
    return true;
  }

  private getCandidates(file: TFile): TFile[] {
    const candidates = [file];
    const seen = new Set<string>([file.path]);
    const directories = file.path.split('/');
    directories.pop();

    for (let depth = directories.length; depth > 0; depth--) {
      const directoryPath = directories.slice(0, depth).join('/');
      const directoryName = directories[depth - 1];
      const notePath = `${directoryPath}/${directoryName}.md`;
      if (seen.has(notePath)) continue;

      seen.add(notePath);
      const candidate = this.vault.getAbstractFileByPath(notePath);
      if (candidate instanceof TFile) candidates.push(candidate);
    }
    return candidates;
  }

  private getDirective(file: TFile): TaskDirective | undefined {
    const frontmatter = this.metadataCache.getFileCache(file)?.frontmatter;
    const directive = frontmatter?.['gtd.task'];

    if (directive === false) return 'exclude';
    if (directive === true) return 'include';
    return undefined;
  }
}
