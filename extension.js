const vscode = require("vscode");
const fetch = require("node-fetch");

let token;
let jsons;

let saveButton;
let fetchButton;

async function loginToAPI() {
  const url = "https://auth-dev.dcluttr.ai/auth/login";

  const headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
  };

  const body = {
    email: "data@dcluttr.ai",
    password: "dev@123456",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    vscode.window.showInformationMessage("Logged into API successfully.");

    token = data.data.accessToken;
  } catch (error) {
    vscode.window.showErrorMessage("API Login failed: " + error.message);
  }
}

async function fetchJSON(brandId) {
  if (!token) {
    await loginToAPI();
  }

  const url = `https://auth-dev.dcluttr.ai/brand/${brandId}/dashboards`;

  const headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
    Authorization: `Bearer ${token}`,
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    jsons = (await response.json()).data;
    return jsons;
  } catch (err) {
    vscode.window.showErrorMessage(
      "Failed to fetch the jsons for the brand: " + err.message
    );
  }
}

async function updateJSON(jsonData) {
  if (!token) {
    await loginToAPI();
  }

  const url = "https://auth-dev.dcluttr.ai/brand/9/dashboards";

  const headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(jsonData),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
}

function replaceFullEditor(editor, text) {
  const document = editor.document;
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, text);
  });
}

function showButtons(context) {
  fetchButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  fetchButton.text = "$(save) Fetch JSON";
  fetchButton.tooltip = "Fetch JSONs for the brand id";
  fetchButton.command = "dcluttr-json-editor.fetchJSON";
  fetchButton.show();

  context.subscriptions.push(fetchButton);

  saveButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  saveButton.text = "$(save) Save JSON";
  saveButton.tooltip = "Save a copy of the current file";
  saveButton.command = "dcluttr-json-editor.saveJSON";
  saveButton.show();

  context.subscriptions.push(saveButton);
}

function hideButtons() {
  if (saveButton) {
    saveButton.hide();
  }
  if (fetchButton) {
    fetchButton.hide();
  }
}

function handleActiveEditorChange(editor, context) {
  if (
    editor &&
    editor.document.fileName.split("/").pop() === "dashboard.json"
  ) {
    showButtons(context); // Show the save button if it's dashboard.json
  } else {
    hideButtons(); // Hide the save button if it's not dashboard.json
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const editor = vscode.window.activeTextEditor;
  handleActiveEditorChange(editor, context);

  // Listen for changes in the active editor (file switch)
  vscode.window.onDidChangeActiveTextEditor((editor) =>
    handleActiveEditorChange(editor, context)
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  const saveJSONCommand = vscode.commands.registerCommand(
    "dcluttr-json-editor.saveJSON",
    function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const text = document.getText();

      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch {
        vscode.window.showErrorMessage("Error parsing json");
      }

      if (!Array.isArray(jsonData)) {
        return;
      }

      const { brandId } = jsonData[0];

      (async () => {
        if (!jsons) {
          const confirmation = await vscode.window.showInformationMessage(
            "No previous JSONs found to compare. Do you wish to update all the jsons in the current file?",
            { modal: true },
            "Yes",
            "No"
          );

          if (confirmation !== "Yes") {
            return;
          }
        }

        let newJSONs = [];
        let diffs = [];
        if (jsons) {
          jsonData.forEach((j) => {
            const original = jsons.find((oj) => oj.id === j.id);
            if (original) {
              const str1 = JSON.stringify(original);
              const str2 = JSON.stringify(j);

              if (str1 !== str2) {
                diffs.push(j);
              }
            } else {
              newJSONs.push(j);
            }
          });
        } else {
          diffs = jsonData;
        }

        if (newJSONs.length) {
          const confirmation = await vscode.window.showInformationMessage(
            `You are going to create ${newJSONs.length} new JSONs and update ${diffs.length} jsons. Are you sure?`,
            { modal: true },
            "Yes",
            "No"
          );

          if (confirmation !== "Yes") {
            return;
          }
        }

        try {
          for (const j of newJSONs) {
            await updateJSON(j);
          }
          for (const j of diffs) {
            await updateJSON(j);
          }
          vscode.window.showInformationMessage(
            `JSONs updated successfully. Updated: ${diffs.length}; New: ${newJSONs.length}`
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            "Failed to update the JSONs: " + err.message
          );
          return;
        }

        const updatedJSONs = await fetchJSON(brandId);
        const jsonToBeReplaced = JSON.stringify(updatedJSONs, null, 2);
        replaceFullEditor(editor, jsonToBeReplaced);
      })();
    }
  );

  const fetchJSONCommand = vscode.commands.registerCommand(
    "dcluttr-json-editor.fetchJSON",
    function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const brandId = document.getText();

      if (!brandId) {
        vscode.window.showWarningMessage("Brand id is not entered");
        return;
      }

      fetchJSON(brandId).then((jsons) => {
        const textToBeReplaced = JSON.stringify(jsons, null, 2);
        replaceFullEditor(editor, textToBeReplaced);
      });
    }
  );

  context.subscriptions.push(saveJSONCommand);
  context.subscriptions.push(fetchJSONCommand);
}

// This method is called when your extension is deactivated
function deactivate() {
  token = null;
  jsons = null;
}

module.exports = {
  activate,
  deactivate,
};
