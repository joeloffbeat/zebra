import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HiddenOrder } from '../sui/types';

interface OrderState {
  orders: HiddenOrder[];

  addOrder: (order: HiddenOrder) => void;
  updateOrderStatus: (commitment: string, status: HiddenOrder['status']) => void;
  removeOrder: (commitment: string) => void;
  getOrderByCommitment: (commitment: string) => HiddenOrder | undefined;
  clearOrders: () => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],

      addOrder: (order) => set((state) => ({
        orders: [...state.orders, order],
      })),

      updateOrderStatus: (commitment, status) => set((state) => ({
        orders: state.orders.map((o) =>
          o.commitment === commitment ? { ...o, status } : o
        ),
      })),

      removeOrder: (commitment) => set((state) => ({
        orders: state.orders.filter((o) => o.commitment !== commitment),
      })),

      getOrderByCommitment: (commitment) =>
        get().orders.find((o) => o.commitment === commitment),

      clearOrders: () => set({ orders: [] }),
    }),
    {
      name: 'zebra-orders',
    }
  )
);
