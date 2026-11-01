# Understand your Kiro credits and costs

A plain-language tour of what Bobert shows, in the order you are likely to ask the questions. Everything here comes from the account updates Kiro writes locally; Bobert reads nothing else about your work and sends nothing anywhere.

## "How much have I used?"

The credit view shows **Credits used** and **Credits left**, taken from the last account update Kiro wrote, with the time of that update. These are the account's own numbers as of then, not a live balance: if Kiro has not written an update for a while, the view says **Stale** instead of guessing. Details: [how-values-are-calculated.md](how-values-are-calculated.md).

## "Will it last until the reset?"

Bobert looks at how fast the counter moved in the updates it has seen and projects that pace to the reset. With little history the answer is marked **provisional**; with enough, it is a regular forecast. It is an estimate that assumes your pace continues, not a promise. When the projection says the limit would be reached early, the headline names the day. Details: [forecasting.md](forecasting.md).

## "What can I spend today?"

The daily budget spreads what is left over the days until the reset. You can limit it to the days you actually work (**Bobert: Set Up**, setting `bobert.budgetDays`). A day without a usable observation is unknown, never counted as zero.

## "What if I go over?"

Past the reported limit, the credit view shows how many add-on credits you would need to keep working until the reset, with a dollar figure modelled from Kiro's list prices (not an invoice). **Bobert: Open Cost Advisor** compares plans and add-ons for the next cycle. Details: [cost-optimizer.md](cost-optimizer.md).

## "How do I use fewer credits?"

Three levers, from easiest: choose the model per step, keep sessions short, and keep what Kiro always reads small. [credit-tips.md](credit-tips.md) explains the habits, [recipes.md](recipes.md) has snippets to copy, and **Bobert: Run Workspace Audit** finds files and settings worth changing.

## "Is this private?"

Bobert reads only the credit fields it needs from Kiro's local account data, stores a small history in its own folder and makes no network calls with your data. See [privacy-and-storage.md](privacy-and-storage.md).
