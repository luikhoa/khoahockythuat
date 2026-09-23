# Frontend Toxic Blur and Per-Tab Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chỉ làm mờ nội dung khi `p_toxic >= 0.60`, cho phép bấm trực tiếp vùng mờ để xem, và cho phép popup che lại các nội dung đã mở trên tab hiện tại mà không reload hoặc chạy inference lại.

**Architecture:** Giữ nguyên model/runtime/backend và schema `Prediction`; content script coi `prediction.proba[1]` là nguồn duy nhất cho chính sách can thiệp UI. Trạng thái mở lại được đánh dấu trên chính phần tử, còn popup dùng `chrome.tabs.query()` + `chrome.tabs.sendMessage()` để gửi một control message thẳng tới content script của tab đang active; service worker không tham gia luồng này.

**Tech Stack:** TypeScript strict, Chrome Extension Manifest V3, DOM/CSS, Vitest + JSDOM, Playwright Chromium.

**Spec:** Thiết kế bounded đã được người dùng duyệt trong hội thoại ngày 2026-09-22; không có spec file riêng.

## Global Constraints

- Không sửa bất kỳ file nào dưới `backend/`; model/runtime vẫn tính `label` với `TOXIC_THRESHOLD = 0.30` như hiện tại.
- Chính sách UI riêng là `p_toxic = prediction.proba[1]`; chỉ blur khi `p_toxic >= 0.60`, kể cả khi `label` hoặc `confidence` mang giá trị khác.
- UI trên trang chỉ có blur; không badge, không nút nổi, không xác suất và không hướng dẫn trực quan.
- Lần click/Enter/Space đầu tiên trên vùng blur chỉ mở nội dung và phải chặn hành động gốc bên dưới; người dùng thao tác lần thứ hai nếu muốn mở link/nút của website.
- Nút popup chỉ che lại nội dung đã mở trong tab hiện tại; không reload, không inference lại, không ảnh hưởng tab khác.
- Che lại không tăng `toxic`, không giảm `revealed`; các số này tiếp tục là lịch sử sự kiện.
- Không thêm dependency và không thêm permission vào `extension/manifest.json`; Tabs API chỉ đọc `tab.id` và nhắn content script đã được khai báo sẵn.
- Giữ TypeScript strict và tiền tố CSS/DOM `cs-` để tránh va chạm website.
- Không chạy `git add`, `git commit` hoặc `git push`; người dùng sở hữu toàn bộ thao tác Git.

## Review Focus

- Biên số học: `p_toxic = 0.5999` không blur, `p_toxic = 0.60` blur, không phụ thuộc `confidence`; Task 1 phải khóa bằng unit test.
- Nội dung có link/nút con: click đầu không được kích hoạt hành động website, click sau khi reveal phải hoạt động bình thường; Task 1 phải khóa bằng unit test.
- Text đổi sau khi reveal: reset không được áp kết quả cache của text cũ; Task 2 phải khóa bằng unit test requeue/reclassification.
- Tab không có content script hoặc trang bị hạn chế (`chrome://`): popup không throw/unhandled rejection và hiển thị trạng thái thất bại; Task 3 phải khóa bằng unit test.
- Nhiều phần tử reveal, trong đó có phần tử đã bị tháo khỏi DOM: reset chỉ đếm và che lại phần tử còn kết nối, còn đủ ngưỡng; Task 2 phải khóa bằng unit test.

---

## File Map

- `extension/src/content/content.ts`: chính sách blur 0.60, direct reveal, lưu/khôi phục thuộc tính accessibility, reset phần tử đã reveal và nhận control message.
- `extension/src/content/content.test.ts`: kiểm thử ngưỡng, không tạo badge, chặn click/keyboard lần đầu, reset không inference lại và xử lý DOM thay đổi.
- `extension/content.css`: chỉ còn kiểu blur/cursor/focus cho nội dung; xoá toàn bộ CSS badge/reveal cũ, giữ nguyên CSS cảnh báo link.
- `extension/src/lib/types.ts`: khai báo riêng `ContentControlMessage` và `RehideRevealedResponse`; không đưa control message vào `ExtensionMessage` của service worker.
- `extension/src/popup/popup.html`: thêm action “Che lại nội dung trên trang này” và vùng status có `aria-live`.
- `extension/src/popup/popup.ts`: tìm tab active, gửi control message và render số nội dung đã che lại/lỗi không hỗ trợ.
- `extension/src/popup/styles.css`: nút action full-width, trạng thái thành công/lỗi nhỏ gọn.
- `extension/src/popup/popup.test.ts`: mock `chrome.tabs`, kiểm thử success/zero/error và bảo đảm nút xoá thống kê độc lập.
- `extension/tests/e2e/extension.smoke.test.ts`: smoke thật cho direct reveal → popup reset → reblur, không badge và không request mạng.
- `README.md`: mô tả đúng `p_toxic >= 0.60`, direct reveal và per-tab reset; bỏ mô tả badge/confidence cũ.
- `docs/LOCAL_MODEL_WORKFLOW.md`: phân biệt ngưỡng phân loại model 0.30 với ngưỡng can thiệp UI 0.60.
- `docs/QA_REPORT.md`: ghi nhận QA-015 được đóng bằng cách loại bỏ badge absolute thay vì sửa định vị.

### Task 1: Apply the 0.60 UI Policy and Replace the Badge with Direct Reveal

**Files:**
- Modify: `extension/src/content/content.test.ts`
- Modify: `extension/src/content/content.ts`
- Modify: `extension/content.css`

**Interfaces:**
- Consumes: `Prediction.proba: [number, number]`, với `proba[1]` là `p_toxic`.
- Produces: `const NGƯỠNG_CHE_P_TOXIC = 0.60`, trạng thái DOM `.cs-blur` và `data-cs-revealed="true"`; không tạo `.cs-badge` hoặc `.cs-reveal`.

- [ ] **Step 1: Replace the old label-driven test with exact p_toxic boundary tests**

Trong `extension/src/content/content.test.ts`, thay test “blur theo đúng label model trả về” bằng hai fixture tách biệt để chứng minh UI không dùng `confidence`:

```ts
const belowUiThreshold = {
  label: 1 as const,
  name: "độc hại",
  confidence: 0.99,
  proba: [0.4001, 0.5999] as [number, number],
};
const atUiThreshold = {
  label: 1 as const,
  name: "độc hại",
  confidence: 0.01,
  proba: [0.4, 0.6] as [number, number],
};

it("chỉ blur theo p_toxic từ 0.60, không theo label hoặc confidence", async () => {
  api.predict
    .mockResolvedValueOnce(belowUiThreshold)
    .mockResolvedValueOnce(atUiThreshold);
  await start("<p id='below'>Dưới ngưỡng UI</p><p id='at'>Ngay ngưỡng UI</p>");
  await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
  expect(document.querySelector("#below")!.classList.contains("cs-blur")).toBe(false);
  expect(document.querySelector("#at")!.classList.contains("cs-blur")).toBe(true);
  expect(document.querySelector(".cs-badge")).toBeNull();
});
```

- [ ] **Step 2: Add failing interaction tests for click, nested actions, keyboard and DOM preservation**

Thêm test tạo một target chứa link có listener riêng, click lần đầu vào link rồi kiểm tra listener website chưa chạy, blur đã bị gỡ, `data-cs-revealed="true"`, parent không bị gán inline `position`, và không có node UI CyberShield. Click lần hai phải chạy listener website. Thêm test `Enter` trên target blur đạt cùng kết quả và `stats.revealed` chỉ tăng một lần.

```ts
it("click đầu chỉ reveal, click sau mới chạy hành động của website", async () => {
  api.predict.mockResolvedValue(atUiThreshold);
  await start("<main id='parent'><p id='target'><a id='link' href='#next'>Nội dung độc hại</a></p></main>");
  const link = document.querySelector("#link") as HTMLAnchorElement;
  // Scanner chọn leaf text là anchor, không phải <p> cha.
  await vi.waitFor(() => expect(link.classList.contains("cs-blur")).toBe(true));
  const websiteClick = vi.fn((event: Event) => event.preventDefault());
  link.addEventListener("click", websiteClick);

  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(websiteClick).not.toHaveBeenCalled();
  expect(link.classList.contains("cs-blur")).toBe(false);
  expect(link.dataset.csRevealed).toBe("true");
  expect((document.querySelector("#parent") as HTMLElement).style.position).toBe("");

  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(websiteClick).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Run the focused tests and confirm the old implementation fails**

Run:

```bash
cd extension
npm test -- src/content/content.test.ts
```

Expected: FAIL vì code hiện tại dùng `label`, tạo `.cs-badge`, đặt `pointer-events: none` và chỉ nút `.cs-reveal` mới mở nội dung.

- [ ] **Step 4: Implement a single p_toxic UI threshold and presentation helpers**

Trong `content.ts`:

```ts
const NGƯỠNG_CHE_P_TOXIC = 0.60;

function nênChe(kết: Prediction): boolean {
  return kết.proba[1] >= NGƯỠNG_CHE_P_TOXIC;
}
```

Xoá `LABELS`, `badgeTheoElement` và toàn bộ DOM badge. Tách presentation khỏi thống kê:

```ts
interface ThuộcTínhGốc {
  tabindex: string | null;
  role: string | null;
  ariaLabel: string | null;
}

const thuộcTínhGốc = new WeakMap<HTMLElement, ThuộcTínhGốc>();

function ápDụngBlur(el: HTMLElement): void {
  if (!thuộcTínhGốc.has(el)) {
    thuộcTínhGốc.set(el, {
      tabindex: el.getAttribute("tabindex"),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
    });
  }
  el.classList.add("cs-blur");
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", "Nội dung đã được CyberShield làm mờ");
  delete el.dataset.csRevealed;
}
```

Viết helper restore đúng ba thuộc tính gốc khi reveal hoặc text thay đổi; không để lại `role`, `tabindex`, `aria-label` do extension tạo.

- [ ] **Step 5: Implement delegated direct reveal without leaking the first action to the website**

Đăng ký `click` và `keydown` ở capture phase. Chỉ xử lý `target.closest(".cs-blur")`; gọi `preventDefault()` và `stopImmediatePropagation()` trước khi restore/reveal. `Enter` và `Space` reveal, các phím khác đi qua. Sau reveal đặt `el.dataset.csRevealed = "true"`, tăng `stats.revealed` đúng một lần và gọi `lưuTrễ()`.

Không gắn listener riêng cho từng target và không tạo DOM con, để giảm bề mặt lỗi khi website re-render.

- [ ] **Step 6: Simplify CSS to blur-only presentation**

Trong `extension/content.css`:

```css
.cs-blur {
  filter: blur(6px) saturate(0.4) !important;
  user-select: none !important;
  cursor: pointer !important;
  transition: filter 160ms ease-out;
}

.cs-blur:focus-visible {
  outline: 2px solid #10162b !important;
  outline-offset: 2px !important;
}
```

Xoá `pointer-events: none` và toàn bộ rule `.cs-badge`, `.cs-badge-text`, `.cs-reveal`, `.cs-toxic`, `.cs-threat` chỉ phục vụ badge. Giữ nguyên toàn bộ rule `.cs-link*`.

- [ ] **Step 7: Use `nênChe()` in the queue and preserve event semantics**

Đổi nhánh cuối `chạyHàngĐợi()` thành:

```ts
if (nênChe(kết)) {
  ápDụngBlur(el);
  stats.toxic++;
}
```

Kết quả dưới 0.60 vẫn tăng `scanned` nhưng không tăng `toxic`. Xoá comment cũ nói content script tin hoàn toàn theo `label`.

- [ ] **Step 8: Run the content tests and typecheck**

Run:

```bash
cd extension
npm test -- src/content/content.test.ts
npm run typecheck
```

Expected: content tests PASS; TypeScript PASS; không còn selector/code `.cs-badge` hoặc `.cs-reveal` trong `content.ts`/`content.css`.

### Task 2: Re-hide Revealed Content Through a Content-Script Control Message

**Files:**
- Modify: `extension/src/lib/types.ts`
- Modify: `extension/src/content/content.test.ts`
- Modify: `extension/src/content/content.ts`

**Interfaces:**
- Consumes: `data-cs-revealed="true"`, `textĐãXửLý`, cache dự đoán theo fingerprint và `nênChe(Prediction)` từ Task 1.
- Produces: `ContentControlMessage = { type: "rehide-revealed" }`, `RehideRevealedResponse = { ok: true; count: number }`, `cheLạiNộiDungĐãMở(): number`.

- [ ] **Step 1: Define a content-only message contract**

Thêm vào `extension/src/lib/types.ts`, tách khỏi `ExtensionMessage` để background không nhận nhầm:

```ts
export type ContentControlMessage = { type: "rehide-revealed" };

export interface RehideRevealedResponse {
  ok: true;
  count: number;
}
```

- [ ] **Step 2: Add failing reset tests for connected, removed and changed elements**

Trong `content.test.ts`, mock `chrome.runtime.onMessage.addListener/removeListener` và giữ callback được đăng ký. Viết test:

1. Hai phần tử đủ ngưỡng được reveal.
2. Một phần tử vẫn kết nối; một phần tử bị `remove()`.
3. Gửi `{ type: "rehide-revealed" }` qua callback.
4. Response là `{ ok: true, count: 1 }`.
5. Phần tử còn lại có `.cs-blur`; `api.predict` không tăng call count; `stats.toxic` và `stats.revealed` không đổi trong thao tác reset.

Viết test riêng đổi `textContent` sau reveal; reset không được reblur bằng prediction cũ và scanner phải gọi `predict` cho fingerprint mới trước khi quyết định.

- [ ] **Step 3: Run the reset tests and verify they fail**

Run:

```bash
cd extension
npm test -- src/content/content.test.ts
```

Expected: FAIL vì chưa có message listener hoặc `cheLạiNộiDungĐãMở()`.

- [ ] **Step 4: Implement deterministic re-hide from existing state**

Export helper:

```ts
export function cheLạiNộiDungĐãMở(): number {
  let count = 0;
  document.querySelectorAll<HTMLElement>("[data-cs-revealed='true']").forEach((el) => {
    const key = fingerprint(el.textContent ?? "");
    const prediction = cache.get(key);
    if (el.isConnected && textĐãXửLý.get(el) === key && prediction && nênChe(prediction)) {
      ápDụngBlur(el);
      count++;
      return;
    }
    delete el.dataset.csRevealed;
    textĐãXửLý.delete(el);
    if (el.isConnected) hàngĐợi.add(el);
  });
  if (hàngĐợi.size > 0) xửLýHàngĐợi();
  return count;
}
```

Không thay đổi bất kỳ counter nào trong helper.

- [ ] **Step 5: Register and clean up the content message listener**

Dùng một named listener, chỉ phản hồi đúng message type và trả synchronous response:

```ts
function nhậnĐiềuKhiển(
  message: ContentControlMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: RehideRevealedResponse) => void,
): boolean {
  if (message?.type !== "rehide-revealed") return false;
  sendResponse({ ok: true, count: cheLạiNộiDungĐãMở() });
  return false;
}
```

Guard môi trường demo/test không có `chrome.runtime.onMessage`; add listener một lần lúc khởi động và remove trong `window.CyberShield.dừng()`.

- [ ] **Step 6: Run content tests and typecheck**

Run:

```bash
cd extension
npm test -- src/content/content.test.ts
npm run typecheck
```

Expected: PASS; reset reuses cache, ignores disconnected nodes and requeues changed text.

### Task 3: Add the Per-Tab Reset Action to the Popup

**Files:**
- Modify: `extension/src/popup/popup.html`
- Modify: `extension/src/popup/popup.ts`
- Modify: `extension/src/popup/styles.css`
- Modify: `extension/src/popup/popup.test.ts`
- Verify unchanged: `extension/manifest.json`

**Interfaces:**
- Consumes: `ContentControlMessage` and `RehideRevealedResponse` from Task 2; `chrome.tabs.query({ active: true, currentWindow: true })`; `chrome.tabs.sendMessage(tabId, message)`.
- Produces: popup button `#che-lại`, live status `#trạng-thái-che-lại`, exported `cheLạiTabHiệnTại(): Promise<number>`.

- [ ] **Step 1: Add the popup markup and test fixture**

Chèn dưới `.lưới` và trên `footer`:

```html
<section class="điều-khiển-trang" aria-label="Điều khiển trang hiện tại">
  <button id="che-lại" type="button">Che lại nội dung trên trang này</button>
  <p id="trạng-thái-che-lại" role="status" aria-live="polite"></p>
</section>
```

Cập nhật `popupBody()` trong `popup.test.ts` có đủ hai id này.

- [ ] **Step 2: Add failing popup tests for success, zero results and unavailable tabs**

Trong `beforeEach`, stub:

```ts
const tabs = {
  query: vi.fn(async () => [{ id: 42 }]),
  sendMessage: vi.fn(async () => ({ ok: true, count: 3 })),
};
vi.stubGlobal("chrome", { tabs });
```

Import `afterEach` từ Vitest và gọi `vi.unstubAllGlobals()` sau mỗi test để mock Tabs API không rò sang test khác.

Các assertion bắt buộc:

- Click gửi `{ type: "rehide-revealed" }` tới tab `42`, disable button khi chờ và hiển thị “Đã che lại 3 nội dung”.
- Response count `0` hiển thị “Không có nội dung cần che lại”.
- `query()` không có `tab.id` hoặc `sendMessage()` reject hiển thị “Trang này không hỗ trợ thao tác này”, re-enable button và không tạo unhandled rejection.
- Click `#xoá` vẫn chỉ gọi `clearStats("day")`, không gọi `tabs.sendMessage`.

- [ ] **Step 3: Run popup tests and verify they fail**

Run:

```bash
cd extension
npm test -- src/popup/popup.test.ts
```

Expected: FAIL vì markup và handler chưa tồn tại.

- [ ] **Step 4: Implement active-tab messaging without involving the service worker**

Trong `popup.ts`:

```ts
export async function cheLạiTabHiệnTại(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("active-tab-unavailable");
  const response = await chrome.tabs.sendMessage<ContentControlMessage, RehideRevealedResponse>(
    tab.id,
    { type: "rehide-revealed" },
  );
  if (!response?.ok || !Number.isInteger(response.count) || response.count < 0) {
    throw new Error("invalid-content-response");
  }
  return response.count;
}
```

Handler click disable button, xoá status cũ, await helper, render copy success/zero, catch lỗi với copy không kỹ thuật, rồi enable trong `finally`.

- [ ] **Step 5: Style the control as a single professional secondary action**

Thêm CSS full-width, không dùng absolute positioning:

```css
.điều-khiển-trang {
  margin: 0 0 14px;
}
.điều-khiển-trang button {
  width: 100%;
  padding: 9px 12px;
  color: var(--chữ);
  background: var(--tấm);
}
#trạng-thái-che-lại {
  min-height: 1.5em;
  margin-top: 6px;
  color: var(--mờ);
  font-size: 10.5px;
}
```

Không đổi bố cục footer/nút “Xoá thống kê”.

- [ ] **Step 6: Confirm no new manifest permission is needed**

Giữ nguyên `manifest.json`. Theo tài liệu Chrome Tabs API, `tabs` permission chỉ cần để đọc các thuộc tính nhạy cảm như URL/title/favicon; luồng này chỉ lấy `tab.id` và gọi `tabs.sendMessage()` tới content script đã được khai báo. Không thêm `tabs`, `activeTab` hoặc `scripting`.

- [ ] **Step 7: Run popup tests and typecheck**

Run:

```bash
cd extension
npm test -- src/popup/popup.test.ts
npm run typecheck
```

Expected: PASS; manifest diff trống.

### Task 4: Lock the Browser Flow, Update Documentation and Verify the Build

**Files:**
- Modify: `extension/tests/e2e/extension.smoke.test.ts`
- Modify: `README.md`
- Modify: `docs/LOCAL_MODEL_WORKFLOW.md`
- Modify: `docs/QA_REPORT.md`

**Interfaces:**
- Consumes: blur-only interaction from Task 1, content message from Task 2 và popup action from Task 3.
- Produces: browser-level regression coverage and current documentation.

- [ ] **Step 1: Update the E2E reveal assertions to target the blurred element directly**

Trước assertion blur, gọi `predict` qua extension message cho `TOXIC_TEXT` và assert `response.data.proba[1] >= 0.60`; điều này chứng minh fixture phù hợp với policy mới. Thay đoạn tìm `.cs-reveal` bằng:

```ts
await expect(tabA.locator("[data-cs-ui='badge']")).toHaveCount(0);
await tabA.locator("#toxic").click();
await expect(tabA.locator("#toxic")).not.toHaveClass(/cs-blur/);
await expect(tabA.locator("#toxic")).toHaveAttribute("data-cs-revealed", "true");
```

Giữ assertion `revealed` tăng đúng một.

- [ ] **Step 2: Exercise the real popup action against the active content tab**

Giữ một extension popup page đã load, gọi `tabA.bringToFront()`, rồi trigger `#che-lại` bằng `popupPage.evaluate(() => document.querySelector<HTMLButtonElement>("#che-lại")!.click())` để không chuyển active tab sang extension page. Poll đến khi popup status chứa “Đã che lại 1 nội dung”, sau đó assert `#toxic` có `.cs-blur` trở lại.

Đọc stats sau reset và assert bằng snapshot sau reveal: `toxic` không tăng, `revealed` không giảm. Assert tab B không bị thay đổi bởi reset tab A.

- [ ] **Step 3: Build and run the offline browser smoke test**

Run:

```bash
cd extension
npm run build
npm run test:e2e
```

Expected: 1/1 Playwright test PASS; không có request tới backend/Hugging Face/CDN; direct reveal và per-tab reset cùng đạt.

- [ ] **Step 4: Update current behavior in README**

Sửa các đoạn mô tả badge/“Vẫn xem” thành click trực tiếp vùng blur. Ghi công thức chính xác:

```text
p_toxic = sigmoid(toxic_logit)
model label = toxic khi p_toxic >= 0.30
frontend blur khi p_toxic >= 0.60
```

Nêu rõ `confidence` không tham gia quyết định/hiển thị; nút popup “Che lại nội dung trên trang này” reset riêng tab active mà không inference lại. Cập nhật bảng tính năng và ưu tiên frontend để bỏ backlog badge.

- [ ] **Step 5: Update workflow and QA records without changing backend**

Trong `docs/LOCAL_MODEL_WORKFLOW.md`, thay câu “content.ts không còn ngưỡng blur riêng” bằng phân biệt rõ model threshold 0.30 và product/UI intervention threshold 0.60; parity `labelAgreement` vẫn nói về model label, còn hành vi blur sản phẩm phải được kiểm bằng frontend/E2E.

Trong `docs/QA_REPORT.md`, thêm cập nhật ngày 22/09/2026: QA-015 đóng vì badge absolute bị loại bỏ; reveal chuyển sang click/keyboard trực tiếp; reset theo tab được kiểm thử. Không viết lại các phần lịch sử 13/09/2026 ngoài việc đánh dấu chúng là lịch sử.

- [ ] **Step 6: Run the full extension verification gate**

Run:

```bash
cd extension
npm run verify
npm run test:e2e
```

Expected: typecheck PASS, toàn bộ Vitest PASS, build PASS, Playwright 1/1 PASS.

- [ ] **Step 7: Perform final static consistency checks**

Run từ repo root:

```bash
rg -n "cs-badge|cs-reveal|confidence >=|label !== 0.*bọc|tin hoàn toàn theo.*label" extension/src extension/content.css README.md docs/LOCAL_MODEL_WORKFLOW.md
rg -n "NGƯỠNG_CHE_P_TOXIC|rehide-revealed|Che lại nội dung trên trang này" extension/src extension/tests README.md
git diff --check
git status --short
```

Expected: lệnh đầu không còn reference hành vi UI cũ (trừ đoạn lịch sử được ghi rõ); lệnh hai tìm thấy implementation + tests + docs; `git diff --check` không báo whitespace error. Không stage hoặc commit file.
