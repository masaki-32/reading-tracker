# 決定事項・運用ルール

## デプロイ運用
- 通常のデプロイはGitHub Web UI（https://github.com/masaki-32/reading-tracker の「Add file → Upload files」）から手動アップロードする運用。CI/CDは導入しない
- 2026-09-08、念のためのバックアップとしてこのフォルダをgit管理下に置き、既存のGitHubリポジトリ（origin, branch: main）と接続・push済み。これにより`git add / commit / push`でも反映できる状態になったが、日常の反映は引き続き手動アップロードで行う想定（切り替えたい場合はユーザーの指示を待つ）
- Cloudflare Workerの反映はダッシュボードの「Edit code」に貼り直して「Deploy」
- 変更完了報告は次の形式で統一する：
  ```
  反映方法：
  Cloudflare：（変更あり/なし）
  GitHub：（アップロードするファイル名）
  ```

## キャッシュ関連の絶対ルール
- **index.htmlを1文字でも変更したら、sw.jsのCACHE_NAMEも必ず同時に1つ上げてセットでアップロードする。**
  理由：sw.jsのfetch処理はキャッシュ優先（cache-first）方式。CACHE_NAMEが変わらないとブラウザは新しいService Workerのインストール自体を行わず、既存端末（特にiPhoneホーム画面のPWA）にはindex.htmlの変更が反映されない。2026-09-08のセッション中に2回上げ忘れて「更新されない」と指摘され、以降は自動で対応する運用にした。
- 検索ロジック（maxResults等）を変更したら、cloudflare-worker.jsのCACHE_VERSIONとindex.htmlのCLIENT_CACHE_VERSIONを**両方**同じ値に上げる。前者だけ上げてもブラウザ自身のHTTPキャッシュに古い結果が最大7日間残り続ける
- GitHub PagesはCache-Control: max-age=600（Fastlyのエッジキャッシュ）。アップロード直後は反映まで最大10分程度のタイムラグが起きうる。確認は`curl -s https://masaki-32.github.io/reading-tracker/index.html`等で生ソースを直接見るのが確実（WebFetchはHTML→テキスト変換されCSS/JSの中身は見えないので不向き）

## アーキテクチャ上の決定
- データ保存はIndexedDBのみ。クラウド同期なしは現時点では意図的な設計（ただし将来的な同期方針は[tasks.md](tasks.md)参照）
- 書籍検索は①OpenBD（ISBN、キー不要・直接）②Google Books（タイトル、Cloudflare Worker経由でAPIキーを秘匿）③Open Library（タイトル、補助・キー不要）の組み合わせ。②③はPromise.allで並行実行しISBN中核9桁で重複排除
- Cloudflare WorkerはALLOWED_ORIGINSで`https://masaki-32.github.io`のみ許可（"null"許可は不可、iframe偽装対策として明示的に除外）

## 事業化する場合（将来、着手判断が出たタイミングで参照）
- 特定商取引法に基づく表記、利用規約・ライセンス条項の整備
- Google Books API / OpenBD / Midjourneyの利用規約が商用利用を許容する範囲か要確認
- 決済導入時の記帳・消費税処理、インフラ費用の経費計上
- 認証・レート制限・監視の追加、決済はStripe等PCI準拠サービス経由（自前でカード情報を扱わない）
- 個人情報保護法（APPI）：プライバシーポリシー公開、開示・訂正・削除請求への対応体制
- ネイティブアプリ（App Store/Google Play）とウェブ版を併存させる場合、WebViewは別ストレージになるため、データのエクスポート/インポート機能（実装済み）が移行ブリッジとして使える

## 技術的制約として認識済み・あえて対応していない事項
- ネイティブアプリ化・本文閲覧機能（電子書籍リーダー化）は対象外と明言済み
- 複数端末の同時編集競合は保存/削除/インポート全てで検知するが、三者間の高度なマージはしない（last-writer-wins＋警告のみ）
- iOS Safari standalone起動とブラウザタブ起動は別ストレージ（OS側の仕様。ただし「同一端末内の一貫性」は[tasks.md](tasks.md)の未着手タスクとして再検討中）
