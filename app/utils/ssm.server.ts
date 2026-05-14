import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

let _client: SSMClient | null = null;
function getClient() {
	if (!_client) {
		_client = new SSMClient({ region: process.env.AWS_REGION ?? "us-east-1" });
	}
	return _client;
}

/**
 * Fetches a single SSM parameter by exact name and returns its string value.
 * SecureString parameters are decrypted automatically.
 * Returns null if the parameter does not exist or access is denied.
 */
export async function fetchParameter(name: string): Promise<string | null> {
	const client = getClient();
	const res = await client.send(
		new GetParameterCommand({ Name: name, WithDecryption: true }),
	);
	return res.Parameter?.Value ?? null;
}
