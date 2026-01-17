import type { StoreId } from "../types/index";
import type { IStoreProvider } from "./IStoreProvider";

export type ProviderFactory<Ctx> = (ctx: Ctx) => IStoreProvider;

export class ProviderRegistry<Ctx> {
  private readonly factories = new Map<StoreId, ProviderFactory<Ctx>>();

  register(storeId: StoreId, factory: ProviderFactory<Ctx>): void {
    this.factories.set(storeId, factory);
  }

  has(storeId: StoreId): boolean {
    return this.factories.has(storeId);
  }

  create(storeId: StoreId, ctx: Ctx): IStoreProvider {
    const f = this.factories.get(storeId);
    if (!f) {
      const available = Array.from(this.factories.keys());
      const availableStr = available.length > 0 ? ` Доступные: ${available.join(", ")}.` : " Нет зарегистрированных провайдеров.";
      throw new Error(
        `No provider registered for storeId="${storeId}".${availableStr}\n` +
        `Провайдер не зарегистрирован. Проверьте наличие credentials для данного store.`,
      );
    }
    return f(ctx);
  }
}

