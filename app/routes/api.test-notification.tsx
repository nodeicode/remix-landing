import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

// Handle GET requests - show test page
export async function loader({ request }: LoaderFunctionArgs) {
	const subscriptions = await getSubscriptions();

	return new Response(
		`<!DOCTYPE html>
<html>
<head>
  <title>Test Push Notifications</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-top: 0;
    }
    .info {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    button {
      background: #2196f3;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 16px;
      border-radius: 6px;
      cursor: pointer;
      width: 100%;
      margin-top: 20px;
    }
    button:hover {
      background: #1976d2;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 4px;
      display: none;
    }
    .success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
    }
    .error {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }
    pre {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔔 Test Push Notifications</h1>
    
    <div class="info">
      <strong>Subscriptions found:</strong> ${subscriptions.length}
      <br><br>
      This will send a test notification to all subscribed clients.
    </div>

    <button onclick="sendTest()" id="sendBtn">
      Send Test Notification
    </button>

    <div id="result" class="result"></div>
  </div>

  <script>
    async function sendTest() {
      const btn = document.getElementById('sendBtn');
      const result = document.getElementById('result');
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      result.style.display = 'none';
      
      try {
        const response = await fetch('/api/test-notification', {
          method: 'POST',
        });
        
        const data = await response.json();
        
        result.className = 'result ' + (response.ok ? 'success' : 'error');
        result.innerHTML = '<strong>' + (response.ok ? '✅ Success!' : '❌ Error!') + '</strong><br><br>' +
          '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        result.style.display = 'block';
      } catch (error) {
        result.className = 'result error';
        result.innerHTML = '<strong>❌ Error!</strong><br><br>' + error.message;
        result.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Test Notification';
      }
    }
  </script>
</body>
</html>`,
		{
			status: 200,
			headers: { "Content-Type": "text/html" },
		}
	);
}

// Handle POST requests - send test notification
export async function action({ request }: ActionFunctionArgs) {
	console.log("[Test Notification] Starting...");

	const subscriptions = await getSubscriptions();
	console.log("[Test Notification] Found", subscriptions.length, "subscriptions");

	if (subscriptions.length === 0) {
		return new Response(
			JSON.stringify({
				success: false,
				message:
					"No subscribers found. Make sure you've allowed notifications on the dashboard.",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
		console.error("[Test Notification] VAPID keys not configured");
		return new Response(
			JSON.stringify({
				error: "VAPID keys not configured.",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	webpush.setVapidDetails(
		"mailto:lohitaryan20@gmail.com",
		process.env.VAPID_PUBLIC_KEY,
		process.env.VAPID_PRIVATE_KEY
	);

	// Send a test notification with content
	const notificationPayload = JSON.stringify({
		title: "🧪 Test Notification",
		body: "If you see this, push notifications are working! 🎉",
		icon: "/favicon.ico",
		badge: "/favicon.ico",
	});

	const promises = subscriptions.map((subscription: PushSubscription) =>
		webpush.sendNotification(subscription, notificationPayload).catch((err: Error) => {
			console.error("[Test Notification] Failed to send to subscriber:", err.message);
			return null;
		})
	);

	try {
		const results = await Promise.all(promises);
		const successCount = results.filter((r: any) => r !== null).length;
		const failedCount = subscriptions.length - successCount;

		console.log(
			`[Test Notification] ✅ Sent to ${successCount}/${subscriptions.length} subscribers`
		);

		return new Response(
			JSON.stringify({
				success: true,
				message: `Test notification sent!`,
				details: {
					total: subscriptions.length,
					successful: successCount,
					failed: failedCount,
				},
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		console.error("[Test Notification] Error:", error);
		return new Response(
			JSON.stringify({
				error: "Failed to send test notification.",
				details: error instanceof Error ? error.message : String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}
