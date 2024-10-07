// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import * as path from 'path';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "helloworld" is now active!');
	let includeMgr = new IncludeManager();
	const problems = vscode.languages.createDiagnosticCollection('Markdown Include');


	let disposable = vscode.commands.registerCommand('markdownsnippetinclude.updateincludes', () => {

		let editor = vscode.window.activeTextEditor;
		if (editor) {

			let doc = editor.document;
			let snips: Array<SnippetInfo> = includeMgr.findAllSnippetSections(doc, problems);
			includeMgr.updateAllSnippets(editor, snips);
		}

	});


	let disposable2 = vscode.commands.registerCommand('markdownsnippetinclude.insertinclude', () => {
		let editor = vscode.window.activeTextEditor;
		if (editor) {

			let doc = editor.document;
			includeMgr.insertSnippet(doc);
		}

	});

	let disposable3 = vscode.commands.registerCommand('markdownsnippetinclude.updateWorkspace', async () => {
		const files = await vscode.workspace.findFiles('*.md');
		files.forEach(async file => {
			console.log(file.toString());
			// we can't open vscode.TextDocuments/Editors for each of these, that creates a flashing UI mess
			// instead, let's just silently work on all the files and hope for the best
			includeMgr.findAllSnippetsAndUpdateFileSilently(file);

		});
	});


	context.subscriptions.push(disposable);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);

	// enable updates on save
	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		if (vscode.workspace.getConfiguration('mdsnip').get('updateSnippetsOnSave', false)) {
			// TODO: This is copypasta
			// Refactor into single function
			let editor = vscode.window.activeTextEditor;
			if (editor) {

				let doc = editor.document;
				let snips: Array<SnippetInfo> = includeMgr.findAllSnippetSections(doc, problems);
				includeMgr.updateAllSnippets(editor, snips);
			}
		}

	});
}

// This method is called when your extension is deactivated
export function deactivate() { }

class SnippetInfo {
	lineStart: number;
	columnStart: number;
	lineEnd: number;
	columnEnd: number;
	fileName: string;
	snippetName: string;
	snippetContent: string;

	constructor() {
		this.lineStart = -1;
		this.columnStart = -1;
		this.lineEnd = -1;
		this.columnEnd = -1;
		this.fileName = "";
		this.snippetName = "";
		this.snippetContent = "";
	}

}


let supportedFiles: Array<any> = [
	{
		files: ["md"],
		regex: '<!--\\s*snippet:\\s*${snipName}\\s*-->(.*?)<!--\\s*\/snippet\\s*-->',
		addCodeBlock: false
	},
	{
		files:
			["cpp", "h"],
		regex: '\/\/!\\s*\\[${snipName}\\](.*?)\/\/!\\s*\\[${snipName}\\]',
		addCodeBlock: true
	},
	{
		files: ["py"],
		regex: '#\\s*\\[${snipName}\\](.*?)#\\s*\\[${snipName}\\]',
		addCodeBlock: true
	},
	{
		files: ["ms", "mxs"],
		regex: '^--\\s*\\[${snipName}\\](.*)^--\\s*\\[${snipName}\\]',
		addCodeBlock: true
	},
	{
		files: ["go", "dart"],
		regex: '\/\/\\s*\\[${snipName}\\](.*?)\/\/\\s*\\[${snipName}\\]',
		addCodeBlock: true
	}

];


class IncludeManager {
	private _includeSnippet: string = "<!-- include: -->\n<!-- /include-->";


	private _includeRegExp: RegExp = /(<!--\s*include:\s*)([^>]*)(\s*-->)/;
	private _includeEnd: RegExp = /<!--\s*\/include\s*-->/;
	// public markerArray = vscode.workspace.getConfiguration('mdsnip').get("snippetMarkers", new Array<string>);
	// console.log(`config: ${JSON.stringify(configuration.snippetMarkers)}`);


	insertSnippet(doc: vscode.TextDocument): void {

		vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(this._includeSnippet));
	}

	getFileSupportRegex(ext: string) {
		let snippetRegex: string = "";
		let addCodeBlock: boolean = false;
		ext = ext.substring(1);
		supportedFiles.forEach((element, index, arr) => {
			if (element.files.includes(ext)) {
				snippetRegex = element.regex;
				addCodeBlock = element.addCodeBlock;
			}
		});

		return { snippetRegex, addCodeBlock };
	}

	updateAllSnippets(editor: vscode.TextEditor, snips: Array<SnippetInfo>): void {
		// Create a sorted copy of snippets in reverse order to prevent position conflicts
		const sortedSnips = snips.slice().sort((a, b) => {
			if (a.lineStart !== b.lineStart) {
				return b.lineStart - a.lineStart; // Descending line order
			}
			return b.columnStart - a.columnStart; // Descending column order
		});
	
		editor.edit(editBuilder => {
			for (const snip of sortedSnips) {
				const startPos = new vscode.Position(snip.lineStart, snip.columnStart);
				const endPos = new vscode.Position(snip.lineEnd, snip.columnEnd);
				const range = new vscode.Range(startPos, endPos);
	
				if (snip.lineStart === snip.lineEnd && snip.columnStart === snip.columnEnd) {
					// Insert snippet at the starting position
					console.log(`Inserting "${snip.snippetName}" at (${snip.lineStart}, ${snip.columnStart})`);
					editBuilder.insert(startPos, snip.snippetContent);
				} else {
					// Replace a range of text with the snippet
					console.log(`Replacing "${snip.snippetName}" from (${snip.lineStart}, ${snip.columnStart}) to (${snip.lineEnd}, ${snip.columnEnd})`);
					editBuilder.replace(range, snip.snippetContent);
				}
			}
		}).then(success => {
			if (success) {
				console.log('Edit succeeded.');
				vscode.window.showInformationMessage('Snippets updated successfully.');
			} else {
				console.warn('Edit failed.');
				vscode.window.showWarningMessage('Failed to update snippets.');
			}
		}, error => {
			console.error(`Edit encountered an error: ${error}`);
			vscode.window.showErrorMessage(`Error updating snippets: ${error.message}`);
		});
	}
	
	findAllSnippetSections(doc: vscode.TextDocument, problems: vscode.DiagnosticCollection): Array<SnippetInfo> {
		let snippetInfos: Array<SnippetInfo> = [];
		let snipInfo: SnippetInfo | null = null; // Use null to indicate no active snippet
	
		// Clear existing problems
		let probs: Array<vscode.Diagnostic> = [];
	
		for (let linenum = 0; linenum < doc.lineCount; linenum++) {
			let line = doc.lineAt(linenum);
			let lineText: string = line.text; // Use full line text to get accurate column positions
	
			// Check for snippet inclusion start
			let includeMatch = this._includeRegExp.exec(lineText);
			if (includeMatch) {
				// Initialize a new SnippetInfo object
				snipInfo = {
					snippetName: "",
					snippetContent: "",
					fileName: "",
					lineStart: linenum,
					columnStart: includeMatch.index + includeMatch[0].length, // Capture the starting column
					lineEnd: linenum,    // Temporary, will be updated when end is found
					columnEnd: includeMatch.index + includeMatch[0].length, // Temporary
				};
	
				// Extract include path from the regex capture group
				let includePath: string = includeMatch[2].trim();
	
				let snipName = "";
				if (includePath.includes('#')) {
					let arr = includePath.split('#');
					includePath = arr[0].trim();
					snipName = arr[1].trim();
					snipInfo.fileName = includePath;
					snipInfo.snippetName = snipName;
				} else {
					snipInfo.fileName = includePath;
					snipInfo.snippetName = "all";
				}
	
				// Resolve the full path relative to the document
				let docPath = doc.fileName;
				includePath = path.resolve(path.dirname(docPath), includePath);
	
				let ext = path.extname(snipInfo.fileName);
	
				let fileSupportOptions = this.getFileSupportRegex(ext);
				let snipStr: string = fileSupportOptions.snippetRegex;
	
				if (snipStr === "") {
					probs.push({
						code: '',
						message: `File type not supported: ${includePath}`,
						severity: vscode.DiagnosticSeverity.Error,
						source: 'Markdown Snippet',
						range: new vscode.Range(
							new vscode.Position(linenum, 0),
							new vscode.Position(linenum, lineText.length)
						)
					});
					snipInfo = null; // Reset as we cannot proceed
					continue; // Move to next line
				}
	
				if (!existsSync(includePath)) {
					probs.push({
						code: '',
						message: `File not found: ${includePath}`,
						severity: vscode.DiagnosticSeverity.Error,
						source: 'Markdown Snippet',
						range: new vscode.Range(
							new vscode.Position(linenum, 0),
							new vscode.Position(linenum, lineText.length)
						)
					});
					snipInfo = null; // Reset as we cannot proceed
					continue; // Move to next line
				}
	
				// Read and process the snippet file
				const content = readFileSync(includePath, 'utf-8');
	
				snipStr = snipStr.replaceAll("${snipName}", snipName);
				let snipRegex = new RegExp(snipStr, "sm");
	
				let snippetMatch = snipRegex.exec(content);
				if (snippetMatch && snippetMatch.length > 1) {
					let snippetStr = snippetMatch[1];
					let snipCodeFence = "";
					let snipCodeFenceEnd = "";
					if (fileSupportOptions.addCodeBlock) {
						snipCodeFence = '```' + ext.slice(1) + '\n';
						snipCodeFenceEnd = '\n```\n';
					}
					snipInfo.snippetContent = `${snipCodeFence}${snippetStr}${snipCodeFenceEnd}`;
				} else {
					// Snippet name not found in the file
					probs.push({
						code: '',
						message: `Snippet name "${snipName}" not found in file: ${includePath}`,
						severity: vscode.DiagnosticSeverity.Error,
						source: 'Markdown Snippet',
						range: new vscode.Range(
							new vscode.Position(linenum, 0),
							new vscode.Position(linenum, lineText.length)
						)
					});
					snipInfo = null; // Reset as snippet not found
					continue; // Move to next line
				}
	
			}
	
			// Check for snippet inclusion end
			let includeEndMatch = this._includeEnd.exec(lineText);
			if (includeEndMatch && snipInfo) {
				// Set the end line and column
				snipInfo.lineEnd = linenum;
				snipInfo.columnEnd = includeEndMatch.index;
	
				// Add the completed SnippetInfo to the array
				snippetInfos.push(snipInfo);
				snipInfo = null; // Reset for the next snippet
				continue; // Move to next line
			}
	
			// Optionally, handle lines within a snippet section if needed
			// For example, if snippets can span multiple lines with content in between
		}
	
		// Handle unclosed snippet sections
		if (snipInfo) {
			probs.push({
				code: '',
				message: `Snippet section starting at line ${snipInfo.lineStart + 1} is not closed.`,
				severity: vscode.DiagnosticSeverity.Error,
				source: 'Markdown Snippet',
				range: new vscode.Range(
					new vscode.Position(snipInfo.lineStart, snipInfo.columnStart),
					new vscode.Position(snipInfo.lineStart, snipInfo.columnStart + 1)
				)
			});
		}
	
		// Set the collected diagnostics
		problems.set(doc.uri, probs);
	
		return snippetInfos;
	} // end findAllSnippetSections

	// This is like the findAllSnippetSections() above, except it works on a file path rather than a
	// vscode.TextDocument.  This allows us to read through a series of files in the workspace and update them
	// Downside: we don't have access to the editor problems list
	findAllSnippetsAndUpdateFileSilently(filePath: vscode.Uri): boolean {
		let snippetInfos: Array<SnippetInfo> = [];
		let snipInfo: SnippetInfo | null = null; // Use null to indicate no active snippet
		let content = readFileSync(filePath.fsPath, 'utf-8');
	
		let lines = content.split('\n');
	
		for (let linenum = 0; linenum < lines.length; linenum++) {
			let lineText: string = lines[linenum]; // Use full line text to get accurate column positions
	
			// Check for snippet inclusion start
			let includeMatch = this._includeRegExp.exec(lineText);
			if (includeMatch) {
				// Handle overlapping snippets
				if (snipInfo) {
					// Previous snippet was not closed
					// Optionally, log or handle this scenario
					// For this example, we'll skip starting a new snippet until the previous is closed
					console.error(`Snippet section starting at line ${snipInfo.lineStart + 1} is not closed before starting a new one.`);
					// Optionally, reset snipInfo
					snipInfo = null;
				}
	
				// Initialize a new SnippetInfo object
				snipInfo = {
					snippetName: "",
					snippetContent: "",
					fileName: "",
					lineStart: linenum,
					columnStart: includeMatch.index + includeMatch[0].length, // Capture the starting column
					lineEnd: linenum,    // Temporary, will be updated when end is found
					columnEnd: includeMatch.index + includeMatch[0].length// Temporary
				};
	
				// Extract include path from the regex capture group
				let includePath: string = includeMatch[2].trim();
	
				let snipName = "";
				if (includePath.includes('#')) {
					let arr = includePath.split('#');
					includePath = arr[0].trim();
					snipName = arr[1].trim();
					snipInfo.fileName = includePath;
					snipInfo.snippetName = snipName;
				} else {
					snipInfo.fileName = includePath;
					snipInfo.snippetName = "all";
				}
	
				// Resolve the full path relative to the document
				let docPath = filePath.fsPath;
				includePath = path.resolve(path.dirname(docPath), includePath);
	
				let ext = path.extname(snipInfo.fileName);
	
				let fileSupportOptions = this.getFileSupportRegex(ext);
				let snipStr: string = fileSupportOptions.snippetRegex;
	
				if (snipStr === "") {
					// File type not supported
					console.error(`File type not supported: ${includePath}`);
					// Optionally, log or handle this scenario
					snipInfo = null; // Reset as we cannot proceed
					continue; // Move to next line
				}
	
				if (!existsSync(includePath)) {
					// File not found
					console.error(`File not found: ${includePath}`);
					// Optionally, log or handle this scenario
					snipInfo = null; // Reset as we cannot proceed
					continue; // Move to next line
				}
	
				// Read and process the snippet file
				const snippetFileContent = readFileSync(includePath, 'utf-8');
	
				snipStr = snipStr.replaceAll("${snipName}", snipName);
				let snipRegex = new RegExp(snipStr, "sm");
	
				let snippetMatch = snipRegex.exec(snippetFileContent);
				if (snippetMatch && snippetMatch.length > 1) {
					let snippetStr = snippetMatch[1];
					let snipCodeFence = "";
					let snipCodeFenceEnd = "";
					if (fileSupportOptions.addCodeBlock) {
						snipCodeFence = '```' + ext.slice(1) + '\n';
						snipCodeFenceEnd = '\n```\n';
					}
					snipInfo.snippetContent = `${snipCodeFence}${snippetStr}${snipCodeFenceEnd}`;
				} else {
					// Snippet name not found in the file
					console.error(`Snippet name "${snipName}" not found in file: ${includePath}`);
					// Optionally, log or handle this scenario
					snipInfo = null; // Reset as snippet not found
					continue; // Move to next line
				}
	
				// Continue to next line to find the end of the snippet section
				continue;
			}
	
			// Check for snippet inclusion end
			let includeEndMatch = this._includeEnd.exec(lineText);
			if (includeEndMatch && snipInfo) {
				// Set the end line and column
				snipInfo.lineEnd = linenum;
				snipInfo.columnEnd = includeEndMatch.index;
	
				// Add the completed SnippetInfo to the array
				snippetInfos.push(snipInfo);
				snipInfo = null; // Reset for the next snippet
				continue; // Move to next line
			}
	
			// Optionally, handle lines within a snippet section if needed
			// For example, if snippets can span multiple lines with content in between
		}
	
		// Handle unclosed snippet sections
		if (snipInfo) {
			console.error(`Snippet section starting at line ${snipInfo.lineStart + 1} is not closed.`);
			// Optionally, handle this scenario
		}
	
		// Process the snippets in reverse order to avoid affecting subsequent positions
		for (let snip of snippetInfos.reverse()) {
			if (snip.lineStart === snip.lineEnd) {
				// Snippet start and end are on the same line
				// Replace the text between columnStart and columnEnd with snippetContent
				let line = lines[snip.lineStart];
				let before = line.substring(0, snip.columnStart);
				let after = line.substring(snip.columnEnd);
				lines[snip.lineStart] = before + snip.snippetContent.trim() + after;
				console.log(`Replacing "${snip.snippetName}" on line ${snip.lineStart + 1} at columns ${snip.columnStart}-${snip.columnEnd}`);
			} else {
				// Snippet spans multiple lines
				// Replace from columnStart of lineStart to columnEnd of lineEnd
				let firstLine = lines[snip.lineStart];
				let lastLine = lines[snip.lineEnd];
	
				let before = firstLine.substring(0, snip.columnStart);
				let after = lastLine.substring(snip.columnEnd);
	
				// Replace the lines between lineStart and lineEnd with snippetContent
				// Include the modified first and last lines with before and after
				let newSnippetLines = snip.snippetContent.trim().split('\n');
	
				// Merge the before part, newSnippetLines, and after part
				let mergedLines = before + newSnippetLines[0];
				if (newSnippetLines.length > 1) {
					mergedLines += '\n' + newSnippetLines.slice(1).join('\n');
				}
				mergedLines += after;
	
				// Remove the lines to be replaced and insert the merged lines
				lines.splice(snip.lineStart, snip.lineEnd - snip.lineStart + 1, mergedLines);
				console.log(`Replacing "${snip.snippetName}" from line ${snip.lineStart + 1} to line ${snip.lineEnd + 1}`);
			}
		}
	
		// Write the modified content back to the file
		writeFileSync(filePath.fsPath, lines.join('\n'), 'utf-8');
	
		return true;
	} // end findAllSnippetsAndUpdateFileSilently

}

