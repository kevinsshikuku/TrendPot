const createFormatter = (currency: string) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  });

const fallbackFormatter = createFormatter("KES");

export const formatCurrencyFromCents = (amount: number, currency: string) => {
  const cents = Math.max(0, Math.round(amount));
  try {
    return createFormatter(currency).format(cents / 100);
  } catch (error) {
    return fallbackFormatter.format(cents / 100);
  }
};

export const calculateCompletionPercentage = (raised: number, goal: number) => {
  if (goal <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((Math.max(0, raised) / goal) * 100));
};
