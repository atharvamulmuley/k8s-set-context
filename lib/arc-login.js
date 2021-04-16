"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const client_1 = require("./client");
const querystring = require("querystring");
const az_login = require("./main")
const path = require("path");
var spawn = require('child_process').spawn;
const fs = require("fs");
function getAzureAccessToken(servicePrincipalId, servicePrincipalKey, tenantId, authorityUrl, managementEndpointUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!servicePrincipalId || !servicePrincipalKey || !tenantId || !authorityUrl) {
            throw new Error("Not all values are present in the creds object. Ensure appId, password and tenant are supplied");
        }
        return new Promise((resolve, reject) => {
            let webRequest = new client_1.WebRequest();
            webRequest.method = "POST";
            webRequest.uri = `${authorityUrl}/${tenantId}/oauth2/token/`;
            webRequest.body = querystring.stringify({
                resource: managementEndpointUrl,
                client_id: servicePrincipalId,
                grant_type: "client_credentials",
                client_secret: servicePrincipalKey
            });
            webRequest.headers = {
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            };
            let webRequestOptions = {
                retriableStatusCodes: [400, 408, 409, 500, 502, 503, 504],
            };
            client_1.sendRequest(webRequest, webRequestOptions).then((response) => {
                if (response.statusCode == 200) {
                    resolve(response.body.access_token);
                }
                else if ([400, 401, 403].indexOf(response.statusCode) != -1) {
                    reject('ExpiredServicePrincipal');
                }
                else {
                    reject('CouldNotFetchAccessTokenforAzureStatusCode');
                }
            }, (error) => {
                reject(error);
            });
        });
    });
}
function getArcKubeconfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let creds = core.getInput('creds');
            let credsObject;
            try {
                credsObject = JSON.parse(creds);
            }
            catch (ex) {
                throw new Error('Credentials object is not a valid JSON: ' + ex);
            }
            let servicePrincipalId = credsObject["clientId"];
            let servicePrincipalKey = credsObject["clientSecret"];
            let tenantId = credsObject["tenantId"];
            let authorityUrl = credsObject["activeDirectoryEndpointUrl"] || "https://login.microsoftonline.com";
            let managementEndpointUrl = credsObject["resourceManagerEndpointUrl"] || "https://management.azure.com/";
            let subscriptionId = credsObject["subscriptionId"];
            let azureSessionToken = yield getAzureAccessToken(servicePrincipalId, servicePrincipalKey, tenantId, authorityUrl, managementEndpointUrl).catch(ex => {
                throw new Error('Could not fetch the azure access token: ' + ex);
            });
            let resourceGroupName = core.getInput('resource-group');
            let clusterName = core.getInput('cluster-name');
            let saToken = core.getInput('token');
            yield az_login.executeAzCliCommand(`account show`, false);
            yield az_login.executeAzCliCommand(`extension add -n connectedk8s`, false);
            yield az_login.executeAzCliCommand(`extension list`, false);
            const runnerTempDirectory = process.env['RUNNER_TEMP']; // Using process.env until the core libs are updated
            const kubeconfigPath = path.join(runnerTempDirectory, `kubeconfig_${Date.now()}`);
            spawn('az',['connectedk8s','proxy','-n','arcaction','-g','atharvatest2','-f',kubeconfigPath], {
                detached: true,
                stdio: 'ignore'
            }).unref();
            console.log('started proxy')
            sleep(240000) //sleeping for a minute to allow kubeconfig to be merged
            fs.chmodSync(kubeconfigPath, '600');
            core.exportVariable('KUBECONFIG', kubeconfigPath);
            console.log('KUBECONFIG environment variable is set');
        }
        catch (ex) {
            return Promise.reject(ex);
        }
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.getArcKubeconfig = getArcKubeconfig;
