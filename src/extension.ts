// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import * as path from 'path';

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


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
	lineEnd: number;
	fileName: string;
	snippetName: string;
	snippetContent: string;

	constructor() {
		this.lineStart = -1;
		this.lineEnd = -1;
		this.fileName = "";
		this.snippetName = "";
		this.snippetContent = "";
	}

}


let supportedFiles: Array<any> = [
	{
		files: ["md"],
		regex: '<!--\\s*snippet:${snipName}-->(.*?)<!--\\s*\/snippet-->',
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
	}

];


class IncludeManager {
	private _includeSnippet: string = "<!-- include: -->\n<!-- /include-->";


	private _includeRegExp: RegExp = /^<!--\s*include:\s*([^>]*)-->/;
	private _includeEnd: RegExp = /^<!--\s*\/include\s*-->/;
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
		editor.edit(editBuilder => {
			for (var snip of snips.reverse()) {
				if (snip.lineStart + 1 === snip.lineEnd) {
					// insert
					console.log(`inserting${snip.snippetName} at ${snip.lineEnd}`);
					editBuilder.insert(new vscode.Position(snip.lineEnd, 0), snip.snippetContent);
				} else {
					// replace
					console.log(`replacing${snip.snippetName} at ${snip.lineStart}-${snip.lineEnd}`);
					editBuilder.replace(new vscode.Range(new vscode.Position(snip.lineStart + 1, 0), new vscode.Position(snip.lineEnd, 0)), snip.snippetContent);
				}

			}
		}).then(success => {
			console.log(`edit succeded: ${success}`);

		});

	}

	findAllSnippetSections(doc: vscode.TextDocument, problems: vscode.DiagnosticCollection): Array<SnippetInfo> {
		let snippetInfos: Array<SnippetInfo> = new Array<SnippetInfo>;
		let snipInfo: SnippetInfo = new SnippetInfo();

		// clear existing problems
		let probs: Array<vscode.Diagnostic> = [];

		for (var linenum = 0; linenum < doc.lineCount; linenum++) {
			let lineText: string = doc.lineAt(linenum).text.trim();
			if (this._includeRegExp.test(lineText)) {
				// we have started a new snippet

				snipInfo.lineStart = linenum;
				let res = this._includeRegExp.exec(lineText);

				if (res && res.length > 1) {
					let includePath: string = res[1];
					// vscode.window.showInformationMessage('found include:' + includePath);
					let snipName = "";
					if (includePath.includes('#')) {
						let arr = includePath.split('#');
						includePath = arr[0];
						snipName = arr[1];
						snipInfo.fileName = includePath;
						snipInfo.snippetName = snipName;

					}
					// include the whole thing
					else {
						snipInfo.fileName = includePath;
						snipInfo.snippetName = "all";
					}
					// console.log("snip: " + snipName);
					let docPath = doc.fileName;
					//const file = readFileSync(includePath);
					includePath = path.resolve(path.dirname(docPath), includePath);
					// console.log(includePath);
					let ext = snipInfo.fileName.substring(snipInfo.fileName.lastIndexOf('.'));

					let fileSupportOptions = this.getFileSupportRegex(ext);
					let snipStr: string = fileSupportOptions.snippetRegex;

					if (snipStr === "") {
						probs.push({
							code: '',
							message: `File type not supported: ${includePath}`,
							severity: vscode.DiagnosticSeverity.Error,
							source: 'Markdown Snippet',
							range: new vscode.Range(new vscode.Position(linenum, 0), new vscode.Position(linenum, lineText.length))
						});
					}


					else if (!existsSync(includePath)) {
						probs.push({
							code: '',
							message: `File not found: ${includePath}`,
							severity: vscode.DiagnosticSeverity.Error,
							source: 'Markdown Snippet',
							range: new vscode.Range(new vscode.Position(linenum, 0), new vscode.Position(linenum, lineText.length))
						});
					}

					// we can proceed and read the file
					else {
						const content = readFileSync(includePath, 'utf-8');

						// console.log(content);
						snipStr = snipStr.replaceAll("${snipName}", snipName);
						let snip = new RegExp(snipStr, "sm");

						res = snip.exec(content);
						if (res && res.length > 1) {
							let snippetStr = res[1];
							let snipCodeFence = "";
							let snipCodeFenceEnd = "\n";
							if (fileSupportOptions.addCodeBlock) {
								snipCodeFence = '```' + ext.slice(1) + '\n';
								snipCodeFenceEnd = '\n```\n';
							}
							// console.log(`snippet: ${snippetStr}`);
							snipInfo.snippetContent = `${snipCodeFence}${snippetStr.trim()}${snipCodeFenceEnd}`;
						}
						else {
							//  no snip name
							probs.push({
								code: '',
								message: `snippet name ${snipName} not found in file: ${includePath}`,
								severity: vscode.DiagnosticSeverity.Error,
								source: 'Markdown Snippet',
								range: new vscode.Range(new vscode.Position(linenum, 0), new vscode.Position(linenum, lineText.length))
							});


						}
					}
				}

			}
			else if (this._includeEnd.test(lineText)) {
				// we're at the end of a include section
				snipInfo.lineEnd = linenum;
				snippetInfos.push(snipInfo);
				snipInfo = new SnippetInfo();
			}
		}
		problems.set(doc.uri, probs);

		return snippetInfos;
	} // end findAllSnippetSections

	// This is like the findAllSnippetSections() above, except it works on a file path rather than a
	// vscode.TextDocument.  This allows us to read through a series of files in the workspace and update them
	// Downside: we don't have access to the editor problems list
	findAllSnippetsAndUpdateFileSilently(filePath: vscode.Uri,): boolean {
		let snippetInfos: Array<SnippetInfo> = new Array<SnippetInfo>;
		let snipInfo: SnippetInfo = new SnippetInfo();
		let content = readFileSync(filePath.fsPath);

		let lines = content.toString().split('\n');
		for (var linenum = 0; linenum < lines.length; linenum++) {
			let lineText: string = lines[linenum].trim();
			if (this._includeRegExp.test(lineText)) {
				// we have started a new snippet

				snipInfo.lineStart = linenum;
				let res = this._includeRegExp.exec(lineText);

				if (res && res.length > 1) {
					let includePath: string = res[1];
					// vscode.window.showInformationMessage('found include:' + includePath);
					let snipName = "";
					if (includePath.includes('#')) {
						let arr = includePath.split('#');
						includePath = arr[0];
						snipName = arr[1];
						snipInfo.fileName = includePath;
						snipInfo.snippetName = snipName;

					}
					// include the whole thing
					else {
						snipInfo.fileName = includePath;
						snipInfo.snippetName = "all";
					}
					// console.log("snip: " + snipName);

					//const file = readFileSync(includePath);
					includePath = path.resolve(path.dirname(filePath.fsPath), includePath);
					// console.log(includePath);
					let ext = snipInfo.fileName.substring(snipInfo.fileName.lastIndexOf('.'));

					let fileSupportOptions = this.getFileSupportRegex(ext);
					let snipStr: string = fileSupportOptions.snippetRegex;

					if (snipStr === "") {

						// file type not supported
					}


					else if (!existsSync(includePath)) {
						// file not found
					}

					// we can proceed and read the file
					else {

						const content = readFileSync(includePath, 'utf-8');

						snipStr = snipStr.replaceAll("${snipName}", snipName);
						let snip = new RegExp(snipStr, "sm");

						// console.log("regex: " + _snip.source);

						res = snip.exec(content);
						if (res && res.length > 1) {
							let snippetStr = res[1];
							let snipCodeFence = "";
							let snipCodeFenceEnd = "\n";
							if (fileSupportOptions.addCodeBlock) {
								snipCodeFence = '```' + ext.slice(1) + '\n';
								snipCodeFenceEnd = '\n```\n';
							}
							// console.log(`snippet: ${snippetStr}`);
							snipInfo.snippetContent = `${snipCodeFence}${snippetStr.trim()}${snipCodeFenceEnd}`;
						}

						else {
							//  no snip name


						}
					}
				}

			}
			else if (this._includeEnd.test(lineText)) {
				// we're at the end of a include section
				snipInfo.lineEnd = linenum;
				snippetInfos.push(snipInfo);
				snipInfo = new SnippetInfo();
			}
		}

		// why don't we just do the replace here?

		for (var snip of snippetInfos.reverse()) {

			if (snip.lineStart + 1 === snip.lineEnd) {
				// insert
				console.log(`inserting${snip.snippetName} at ${snip.lineEnd}`);
				lines.splice(snip.lineEnd, 0, snip.snippetContent.trim());
			}

			else {
				// replace
				console.log(`replacing${snip.snippetName} at ${snip.lineStart}-${snip.lineEnd}`);
				lines.splice(snip.lineStart + 1, (snip.lineEnd-snip.lineStart -1), snip.snippetContent.trim());
				
			}
		}

		// write the file
		writeFileSync(filePath.fsPath, lines.join('\n') );

		return true;

	} // end findAllSnippetSectionsFile



}

