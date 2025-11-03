import type { ActionFunctionArgs } from "react-router";
import type { PushSubscription } from "web-push";

// This is a placeholder for where you would store subscriptions.
// In a real application, you would use a database.
let subscriptions: PushSubscription[] = [];

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscription = await request.json();
  
  // In a real app, you'd save this to a database.
  // You should also check for duplicate subscriptions.
  console.log("[Subscribe] New subscription received:", subscription);
  subscriptions.push(subscription as PushSubscription);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Function to get stored subscriptions
export function getSubscriptions() {
  return subscriptions;
}
