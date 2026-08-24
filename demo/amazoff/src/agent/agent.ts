import type { AgentConfig, ToolCall } from "@wingman/schema";

import { OrderError, type Order, type OrderBook } from "../store/orders.js";
import { resolveDate } from "./dates.js";
import { parseInstructions } from "./instructions.js";
import { selectTool, type ToolSelection } from "./select.js";

export interface AgentReply {
  text: string;
  toolCalls: ToolCall[];
  selection: ToolSelection | null;
  /** Present when the agent could not find a tool for what was asked. */
  unsupported: boolean;
}

interface RespondInput {
  utterance: string;
  customerId: string;
  config: AgentConfig;
  /**
   * A tool choice already made elsewhere, normally by a language model. When absent the
   * agent falls back to its own config-driven selection, so the demo still runs if the
   * model is slow or unreachable.
   */
  selection?: ToolSelection | null;
}

/**
 * Amazoff's support agent. The host supplies the current signed config on every turn,
 * which is what allows a Wingman fix to take effect mid-conversation without a redeploy.
 */
export class AmazoffAgent {
  readonly #orders: OrderBook;
  readonly #today: () => string;

  constructor(orders: OrderBook, today: () => string = () => new Date().toISOString().slice(0, 10)) {
    this.#orders = orders;
    this.#today = today;
  }

  respond({ utterance, customerId, config, selection: given }: RespondInput): AgentReply {
    // Greetings and thanks need no tool, and treating them as unmet requests would both
    // read as broken to the customer and raise a capability alert out of nothing.
    if (isSmallTalk(utterance)) {
      return {
        text: greet(this.#targetOrder(customerId, null)),
        toolCalls: [],
        selection: null,
        unsupported: false,
      };
    }

    const selection = given ?? selectTool(utterance, config);
    if (selection === null) {
      return {
        text: "I'm sorry, I can't do that from here. I can track a package, add a delivery note, change a delivery date, cancel an order, start a return, issue a refund, or connect you to a person.",
        toolCalls: [],
        selection: null,
        unsupported: true,
      };
    }

    const order = this.#targetOrder(customerId, selection.tool);
    if (order === null) {
      return {
        text: "I couldn't find an active order on your account.",
        toolCalls: [],
        selection,
        unsupported: false,
      };
    }

    const args = this.#args(selection.tool, utterance, order);
    try {
      const text = this.#execute(selection.tool, order.id, args);
      return {
        text,
        toolCalls: [{ name: selection.tool, args: { orderId: order.id, ...args } }],
        selection,
        unsupported: false,
      };
    } catch (error) {
      if (!(error instanceof OrderError)) throw error;
      return {
        text: error.message,
        toolCalls: [{ name: selection.tool, args: { orderId: order.id, ...args } }],
        selection,
        unsupported: false,
      };
    }
  }

  #execute(tool: string, orderId: string, args: Record<string, string>): string {
    switch (tool) {
      case "cancel_order": {
        const order = this.#orders.cancel(orderId);
        return `I've cancelled order ${order.id} for you. Your refund will arrive in 3-5 business days.`;
      }
      case "reschedule_delivery": {
        const date = args.deliveryDate ?? this.#today();
        const before = this.#orders.get(orderId);
        const order = this.#orders.reschedule(orderId, date);
        const revived = before?.status === "CANCELLED";
        return revived
          ? `Order ${order.id} is reinstated and your delivery is now set for ${order.deliveryDate}.`
          : `Your delivery for order ${order.id} is now set for ${order.deliveryDate}.`;
      }
      case "get_order": {
        const order = this.#orders.get(orderId);
        return order
          ? `Order ${order.id}: ${order.summary}, ${order.status.toLowerCase().replace("_", " ")}, arriving ${order.deliveryDate}.`
          : `I couldn't find order ${orderId}.`;
      }
      case "track_package": {
        const order = this.#orders.get(orderId);
        if (!order) return `I couldn't find order ${orderId}.`;
        const tracking = order.tracking ?? "not assigned yet";
        const scan =
          order.status === "IN_TRANSIT"
            ? "out for delivery"
            : order.status.toLowerCase().replace("_", " ");
        return `Your ${order.summary} is with ${order.carrier ?? "the courier"}, tracking ${tracking}. Last scan: ${scan}, arriving ${order.deliveryDate}.`;
      }
      case "set_courier_note": {
        const order = this.#orders.setInstructions(orderId, args.instructions ?? "");
        return `Done — I've added this note for the courier on order ${order.id}: ${order.instructions}.`;
      }
      case "speak_to_human": {
        return "I've requested a callback. An Amazoff associate will reach you at the number on this account.";
      }
      case "start_return": {
        const order = this.#orders.startReturn(orderId);
        return `I've started a return for order ${order.id}.`;
      }
      case "issue_refund": {
        const order = this.#orders.refund(orderId);
        return `I've issued a refund for order ${order.id}.`;
      }
      default:
        return "I'm not able to do that.";
    }
  }

  #args(tool: string, utterance: string, order: Order): Record<string, string> {
    if (tool === "set_courier_note") {
      return { instructions: parseInstructions(utterance) };
    }
    if (tool !== "reschedule_delivery") return {};
    const date = resolveDate(utterance, this.#today(), order.deliveryDate);
    return { deliveryDate: date ?? order.deliveryDate };
  }

  /** The demo has one active order per customer, so "my delivery" is unambiguous. */
  #targetOrder(customerId: string, tool: string | null): Order | null {
    const orders = this.#orders.forCustomer(customerId);
    if (tool === "start_return" || tool === "issue_refund") {
      return orders.find(({ status }) => status === "DELIVERED") ?? orders[0] ?? null;
    }
    return orders.find(({ status }) => status !== "DELIVERED") ?? orders[0] ?? null;
  }
}

function greet(order: Order | null): string {
  if (order === null) {
    return "Hi! I can help with deliveries, tracking, returns or refunds. What do you need?";
  }
  return `Hi — I have ${order.summary} on the way (${order.id}), arriving ${order.deliveryDate}. I can move the date, add a delivery note, track the parcel, or help with a return.`;
}

const SMALL_TALK =
  /^\s*(hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|good (morning|afternoon|evening))[\s!.,?]*$/i;

function isSmallTalk(utterance: string): boolean {
  return SMALL_TALK.test(utterance);
}
