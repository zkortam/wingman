import type { Order } from "./store/orders.js";

export interface Customer {
  id: string;
  name: string;
  email: string;
}

/**
 * Stevette is the customer in the demo. Sam exists so the promotion story has a second
 * person: the same defect reaching a second user is what turns one incident into
 * evidence, and a third customer arriving after the global fix is what proves it held.
 */
export const AMAZOFF_CUSTOMERS: readonly Customer[] = [
  { id: "stevette", name: "Stevette Marsh", email: "stevette@example.com" },
  { id: "sam", name: "Sam Okafor", email: "sam@example.com" },
  { id: "priya", name: "Priya Raman", email: "priya@example.com" },
];

export const AMAZOFF_ORDERS: readonly Order[] = [
  {
    id: "AMZ-4417",
    customerId: "stevette",
    summary: "Trail running shoes, size 8",
    deliveryDate: "2026-08-26",
    status: "IN_TRANSIT",
    statusBeforeCancel: null,
  },
  {
    id: "AMZ-5120",
    customerId: "sam",
    summary: "Espresso grinder",
    deliveryDate: "2026-08-27",
    status: "IN_TRANSIT",
    statusBeforeCancel: null,
  },
  {
    id: "AMZ-6033",
    customerId: "priya",
    summary: "Standing desk mat",
    deliveryDate: "2026-08-29",
    status: "PLACED",
    statusBeforeCancel: null,
  },
];
