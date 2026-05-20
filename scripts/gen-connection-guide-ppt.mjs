// AWS 연결 가이드 PPT 생성 v0.9 (cross-account 제외, same-account only).
// 실행: node scripts/gen-connection-guide-ppt.mjs
// 결과: c:/tmp/aws-connection-guide-v0.9.pptx
//
// 디자인: Kiro NavBar 톤 (Squid Ink #232f3e 헤더 + 흰 본문 + 토스블루 액센트)
// TBIT 로고: layout 에 임베디드 (잠긴 상태)
// 작성자 텍스트: per-slide — PowerPoint 에서 한 번 마스터로 옮기면 잠김
//
// 캡처 placeholder 슬라이드들에는 어떤 화면을 어디서 잡아야 하는지 상세 가이드.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const py = String.raw`
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW = prs.slide_width
SH = prs.slide_height

# ─ 색상 토큰 ──────────────────────────────────────────
NAVY      = RGBColor(0x23, 0x2f, 0x3e)
NAVY_DK   = RGBColor(0x16, 0x1e, 0x2d)
WHITE     = RGBColor(0xff, 0xff, 0xff)
BG        = RGBColor(0xfa, 0xfa, 0xfa)
TEXT      = RGBColor(0x16, 0x19, 0x1f)
MUTE      = RGBColor(0x5f, 0x6b, 0x7a)
ACCENT    = RGBColor(0x09, 0x72, 0xd3)
ORANGE    = RGBColor(0xec, 0x72, 0x11)
LIGHT     = RGBColor(0xea, 0xed, 0xed)
CODE_BG   = RGBColor(0x16, 0x19, 0x1f)
CODE_FG   = RGBColor(0xd1, 0xd5, 0xdb)
INFO_BG   = RGBColor(0xf7, 0xfb, 0xfd)
INFO_RING = RGBColor(0xcc, 0xe4, 0xf5)
TIP_BG    = RGBColor(0xff, 0xfa, 0xf0)
TIP_RING  = RGBColor(0xfa, 0xd9, 0xa0)

TBIT_LOGO = r"public/logo-tbit-white.png"

# ─ 마스터 셋업 ────────────────────────────────────────
def setup_master():
    layout = prs.slide_layouts[6]  # blank
    try:
        layout.shapes.add_picture(TBIT_LOGO, Inches(11.5), Inches(0.18),
                                  height=Inches(0.5))
    except Exception:
        pass

# ─ 헬퍼 ───────────────────────────────────────────────
def add_rect(slide, x, y, w, h, fill, line=None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(0.5)
    s.shadow.inherit = False
    return s

def add_text(slide, x, y, w, h, text, size=14, color=TEXT, bold=False,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, font="Pretendard"):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    tf.vertical_anchor = anchor
    lines = text.split("\n") if isinstance(text, str) else text
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        p.alignment = align
        p.font.name = font
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.bold = bold
    return tb

def add_master(slide, title_text):
    """본문 슬라이드 공통 chrome."""
    add_rect(slide, Emu(0), Emu(0), SW, Inches(0.85), NAVY)
    add_text(slide, Inches(0.5), Inches(0.13), Inches(10), Inches(0.6),
             title_text, size=22, color=WHITE, bold=True,
             anchor=MSO_ANCHOR.MIDDLE)
    add_rect(slide, Emu(0), Inches(0.85), SW, Inches(0.03), ACCENT)
    add_rect(slide, Emu(0), Inches(7.10), SW, Inches(0.4), NAVY_DK)
    add_text(slide, Inches(0.5), Inches(7.18), Inches(8), Inches(0.3),
             "Kiro 통합 랭킹  ·  AWS 연결 가이드  v0.9",
             size=10, color=LIGHT, anchor=MSO_ANCHOR.MIDDLE)
    # 작성자 — PowerPoint 에서 마스터로 옮기면 잠김
    add_text(slide, Inches(8), Inches(7.18), Inches(4.8), Inches(0.3),
             "2026.05.20  ·  김수종 책임",
             size=10, color=LIGHT, align=PP_ALIGN.RIGHT,
             anchor=MSO_ANCHOR.MIDDLE)

BODY_TOP = Inches(1.1)
BODY_LEFT = Inches(0.6)
BODY_WIDTH = Inches(12.13)

# ─ 슬라이드 타입 ─────────────────────────────────────

def title_slide(title, subtitle, version):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, Emu(0), Inches(0.88), SW, Inches(6.22), NAVY)
    add_rect(s, Emu(0), Inches(2.6), SW, Inches(0.06), ACCENT)
    add_text(s, Inches(1), Inches(2.9), Inches(11.3), Inches(1.6),
             title, size=54, color=WHITE, bold=True, align=PP_ALIGN.LEFT)
    add_text(s, Inches(1), Inches(4.5), Inches(11.3), Inches(0.8),
             subtitle, size=22, color=LIGHT, align=PP_ALIGN.LEFT)
    # 버전 배지
    badge = add_rect(s, Inches(1), Inches(5.6), Inches(1.5), Inches(0.4), ACCENT)
    add_text(s, Inches(1), Inches(5.6), Inches(1.5), Inches(0.4),
             version, size=13, color=WHITE, bold=True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

def content_slide(title, bullets, note=None):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_master(s, title)
    add_rect(s, BODY_LEFT, BODY_TOP, BODY_WIDTH, Inches(5.8), WHITE, line=LIGHT)
    add_rect(s, BODY_LEFT, BODY_TOP, Inches(0.06), Inches(5.8), ACCENT)
    tb = s.shapes.add_textbox(BODY_LEFT + Inches(0.5), BODY_TOP + Inches(0.3),
                              BODY_WIDTH - Inches(0.7), Inches(5.2))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, b in enumerate(bullets):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = b
        p.font.name = "Pretendard"
        p.font.size = Pt(18)
        p.font.color.rgb = TEXT
        p.space_after = Pt(10)
    if note:
        add_text(s, BODY_LEFT + Inches(0.5), Inches(6.55), BODY_WIDTH - Inches(0.7),
                 Inches(0.4), "💡 " + note, size=11, color=MUTE)

def code_slide(title, code, note=None):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_master(s, title)
    add_rect(s, BODY_LEFT, BODY_TOP, BODY_WIDTH, Inches(5.4), CODE_BG)
    tb = s.shapes.add_textbox(BODY_LEFT + Inches(0.3), BODY_TOP + Inches(0.25),
                              BODY_WIDTH - Inches(0.6), Inches(5))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.text = code
    for p in tf.paragraphs:
        p.font.name = "Consolas"
        p.font.size = Pt(12)
        p.font.color.rgb = CODE_FG
        p.space_after = Pt(0)
    if note:
        add_text(s, BODY_LEFT, Inches(6.6), BODY_WIDTH, Inches(0.4),
                 "💡 " + note, size=11, color=MUTE, anchor=MSO_ANCHOR.MIDDLE)

def screenshot_slide(title, where, tips, image_path=None):
    """캡처 슬라이드: where = 어디서 캡처 / tips = 부수 안내 / image_path = 임베드할 캡처"""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_master(s, title)
    # 캡처 영역 (위 60%)
    add_rect(s, BODY_LEFT, BODY_TOP, BODY_WIDTH, Inches(3.8), BG, line=LIGHT)
    if image_path:
        # 캡처 이미지 임베드 — 영역 안에 비율 유지하며 fit
        import os
        if os.path.exists(image_path):
            s.shapes.add_picture(image_path,
                                 BODY_LEFT + Inches(0.15), BODY_TOP + Inches(0.15),
                                 width=BODY_WIDTH - Inches(0.3),
                                 height=Inches(3.5))
        else:
            add_text(s, BODY_LEFT, BODY_TOP + Inches(1.8), BODY_WIDTH, Inches(0.5),
                     f"⚠ 이미지 없음: {image_path}", size=14, color=MUTE,
                     align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    else:
        # 빈 placeholder
        add_text(s, BODY_LEFT, BODY_TOP + Inches(1.3), BODY_WIDTH, Inches(0.5),
                 "📸", size=44, color=MUTE, align=PP_ALIGN.CENTER,
                 anchor=MSO_ANCHOR.MIDDLE)
        add_text(s, BODY_LEFT, BODY_TOP + Inches(2.2), BODY_WIDTH, Inches(0.5),
                 "여기에 AWS Console 캡처 삽입", size=18, color=MUTE,
                 align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # 위치 안내 (info 톤)
    add_rect(s, BODY_LEFT, Inches(5.1), BODY_WIDTH, Inches(0.6),
             INFO_BG, line=INFO_RING)
    add_text(s, BODY_LEFT + Inches(0.3), Inches(5.18), BODY_WIDTH - Inches(0.4),
             Inches(0.5), "📍 위치: " + where,
             size=12, color=NAVY_DK, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    # 부수 팁 (tip 톤)
    tip_h = Inches(0.5 + 0.3 * len(tips))
    add_rect(s, BODY_LEFT, Inches(5.85), BODY_WIDTH, tip_h, TIP_BG, line=TIP_RING)
    tb = s.shapes.add_textbox(BODY_LEFT + Inches(0.3), Inches(5.93),
                              BODY_WIDTH - Inches(0.4), tip_h - Inches(0.1))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, t in enumerate(tips):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = ("💡 " if i == 0 else "   ") + t
        p.font.name = "Pretendard"
        p.font.size = Pt(11)
        p.font.color.rgb = NAVY_DK
        p.space_after = Pt(3)

def section_divider(num, title, points):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, Emu(0), Inches(0.88), SW, Inches(6.22), NAVY)
    # 큰 번호
    add_text(s, Inches(1), Inches(1.8), Inches(2), Inches(2),
             num, size=120, color=ACCENT, bold=True,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.MIDDLE)
    # 섹션 타이틀
    add_text(s, Inches(3.3), Inches(2.4), Inches(9), Inches(1),
             title, size=40, color=WHITE, bold=True, align=PP_ALIGN.LEFT)
    # 요약 포인트
    tb = s.shapes.add_textbox(Inches(3.3), Inches(3.7), Inches(9), Inches(2.5))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, pt in enumerate(points):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = "▸  " + pt
        p.font.name = "Pretendard"
        p.font.size = Pt(16)
        p.font.color.rgb = LIGHT
        p.space_after = Pt(8)

# ─ 슬라이드 구성 ──────────────────────────────────────

setup_master()

# === 표지 ===
title_slide(
    "AWS 연결 가이드",
    "Kiro 통합 랭킹 — 같은 AWS 계정 모델 (TBIT 내부용)",
    "v0.9"
)

# === 개요 ===
content_slide("개요 — connection 이 뭔가", [
    "•  AWS 계정 1개 + 그 안의 Identity Center 1개 + Kiro CSV 가 쌓이는 S3 1개 = connection 1건",
    "•  한 connection 이 여러 학교(IC 그룹) 호스팅 가능",
    "•  슈퍼 어드민이 connection 한 번 등록 → sync 가 학교/학생 자동 생성",
    "•  ingest 가 매일 S3 에서 CSV 끌어와 사용량 적재 → 랭킹 표시",
    "",
    "📌  이 가이드 v0.9 는 학교 그룹이 우리 AWS 계정 안에 있는 경우 (same-account) 만 다룸.",
    "📌  학교가 자기 AWS 계정으로 합류하는 cross-account 시나리오는 v1.0 에서 다룰 예정.",
])

content_slide("전체 흐름 (5단계)", [
    "1.  S3 버킷 생성 — Kiro CSV 가 쌓일 곳",
    "2.  Kiro Console 에서 user activity report 활성화 → 위 S3 로 출력 지정",
    "3.  IAM 사용자에 S3 read + Identity Center read 권한 부여",
    "4.  /admin/connections 에서 connection 1건 등록 (Role ARN 비움)",
    "5.  📡 연결 테스트 클릭 → 성공이면 자정 sync + 11:05 ingest 자동",
])

# === §1 S3 버킷 생성 ===
section_divider("1", "S3 버킷 생성", [
    "Kiro user activity report 가 떨어질 자리",
    "리전은 us-east-1 권장 (Kiro 서비스가 동일 리전)",
    "Public access 는 막아두고, Kiro 서비스에만 PutObject 허용",
])

content_slide("§1. S3 버킷 만들기", [
    "1.  AWS Console → S3 → Create bucket",
    "2.  버킷 이름: 전 세계 unique. 예 — tbit-kiro-prod, my-kiro-reports",
    "3.  리전: us-east-1 (Kiro 가 이 리전 기반)",
    "4.  Object Ownership: Bucket owner enforced (ACL 비활성)",
    "5.  Block all public access: 체크 유지 (외부 노출 차단)",
    "6.  나머지 기본값 → Create bucket",
],
    note="버킷 prefix (예: kiro-reports) 는 옵션. 나중에 Kiro Console 에서 지정 가능.")

screenshot_slide(
    "§1. S3 버킷 생성 화면",
    "AWS Console → S3 → 좌측 Buckets → 우측 [Create bucket] 클릭 → 이름/리전 입력 화면",
    [
        "버킷 이름은 소문자/숫자/하이픈만, 3~63자. 한 번 만들면 변경 불가.",
        "리전 드롭다운에서 명시적으로 us-east-1 선택 — 기본값이 다른 리전일 수 있음.",
        "Object Ownership 박스가 보이면 'ACLs disabled' 옵션 선택.",
    ]
    # 신규 캡처 필요 — 아직 placeholder
)

screenshot_slide(
    "§1. 버킷 ARN / 리전 확인",
    "AWS Console → S3 → 만든 버킷 클릭 → Properties 탭",
    [
        "'버킷 개요' 박스에 AWS 리전 + ARN 표시. 빨간 박스로 강조된 영역.",
        "ARN 형식: arn:aws:s3:::<버킷명> — 우리 IAM 정책 Resource 에 그대로 사용.",
        "리전은 'US East (N. Virginia) us-east-1' 같이 표시.",
    ],
    image_path=r"c:/tmp/ppt-captures/slide10_pic1.png"
)

# === §2 Kiro → S3 ===
section_divider("2", "Kiro → S3 연결", [
    "Kiro Console 에서 user activity report 활성화",
    "출력 대상으로 위에서 만든 S3 URI 지정",
    "Kiro 가 매일 02:00 UTC 에 전날 자 CSV 떨어뜨리기 시작",
])

content_slide("§2. Kiro user activity report 활성화", [
    "1.  AWS Console → Amazon Q Developer (Kiro) → Settings",
    "2.  User activity report 섹션 → Enable",
    "3.  S3 URI 입력: s3://<버킷명>/<prefix>/ (예: s3://tbit-kiro-prod/kiro-reports/)",
    "4.  Save",
    "5.  다음 날 02:00 UTC (= 11:00 KST) 부터 CSV 가 S3 에 떨어짐",
],
    note="prefix 는 옵션. 안 쓰면 버킷 root 에 바로 쌓임. 학교별 분리 안 해도 됨 (한 S3 에 다 모임).")

screenshot_slide(
    "§2. Kiro 리포트 활성화 화면",
    "Q Developer (Kiro) Console → Settings → User activity report",
    [
        "처음 활성화하면 Kiro 가 자동으로 우리 S3 버킷에 PutObject 권한 요청.",
        "S3 버킷 정책에 'Principal: kiro.amazonaws.com' 의 PutObject 허용 자동 추가됨.",
        "S3 URI 형식 주의: s3:// 로 시작, 끝에 슬래시 / 있어야 prefix 로 처리.",
    ]
    # 신규 캡처 필요 — placeholder
)

screenshot_slide(
    "§2. S3 에 첫 CSV 도착 확인",
    "AWS Console → S3 → 우리 버킷 → Objects 탭",
    [
        "경로 패턴: <prefix>/AWSLogs/<계정ID>/KiroLogs/user_report/<region>/<yyyy>/<mm>/<dd>/00/<filename>.csv",
        "Kiro 활성화 다음 날 새벽까지는 비어있음. 02:00 UTC (11:00 KST) 이후 등장.",
        "파일 안 보이면: Kiro Settings 다시 가서 S3 URI 오타 확인 + Kiro 가 PutObject 권한 받았는지.",
    ]
    # 신규 캡처 필요 — placeholder
)

# === §3 IAM 권한 ===
section_divider("3", "IAM 권한 부여", [
    "우리 IAM 사용자 (예: kiro-ingest) 에 정책 첨부",
    "S3 read + Identity Center read 권한 필수",
    "같은 AWS 계정이어도 명시적 부여 필요 — 안 하면 AccessDenied",
])

content_slide("§3. IAM 사용자 + 정책", [
    "1.  AWS Console → IAM → Users → Create user (예: kiro-ingest)",
    "2.  Access type: programmatic access only (콘솔 로그인 X)",
    "3.  Permissions → Attach policies directly → 그 다음 슬라이드의 inline policy 추가",
    "4.  사용자 생성 후 Security credentials 탭에서 access key 발급",
    "5.  발급된 key 를 서버 .env 의 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 에 입력",
],
    note="이미 운영 중인 kiro-ingest 사용자가 있으면 1, 2 단계 skip 하고 inline policy 만 추가/갱신.")

code_slide("§3. 권한 정책 JSON (Inline)", '''{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Read",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<우리 버킷명>",
        "arn:aws:s3:::<우리 버킷명>/*"
      ]
    },
    {
      "Sid": "ICRead",
      "Effect": "Allow",
      "Action": [
        "sso:ListInstances",
        "identitystore:ListGroups",
        "identitystore:ListUsers",
        "identitystore:ListGroupMemberships"
      ],
      "Resource": "*"
    }
  ]
}''',
    note="<우리 버킷명> 두 곳을 §1 에서 만든 실제 이름으로 교체. 예: tbit-kiro-prod")

screenshot_slide(
    "§3. Inline 정책 메뉴 진입",
    "AWS Console → IAM → Users → kiro-ingest → 우측 상단 [권한 추가] 드롭다운 → [인라인 정책 생성]",
    [
        "Inline policy 로 추가하면 해당 사용자에게만 적용 (managed policy 와 분리).",
        "기존 정책이 있으면 '권한 정책' 섹션에 표시. 새 정책 추가 시 [인라인 정책 생성] 클릭.",
        "MFA 경고 떠있어도 정책 추가에는 무관 — 별도 작업.",
    ],
    image_path=r"c:/tmp/ppt-captures/slide06_pic1.png"
)

screenshot_slide(
    "§3. JSON 정책 편집기",
    "Create inline policy → 우상단 [JSON] 탭 → 정책 편집기에 위 슬라이드 JSON 붙여넣기 → 우상단 [정책 생성]",
    [
        "S3 ARN 두 줄 모두 필요: 버킷 자체 (ListBucket용) + /* 객체들 (GetObject용).",
        "Identity Center 액션들은 Resource '*' 가 정상 — store ID 가 ARN 으로 안 나옴.",
        "v0.9 는 sts:AssumeRole 안 써도 무방. 박혀있어도 무해 (v1.0 대비).",
        "저장 후 정책 이름 자유 (예: kiro-ingest-policy).",
    ],
    image_path=r"c:/tmp/ppt-captures/slide07_pic1.png"
)

# === §4 IC 인스턴스 + 학생 셋업 ===
section_divider("4", "Identity Center 준비", [
    "IC 인스턴스 ID 확인 (connection 등록에 필요)",
    "학교 그룹 + 학생 사용자가 IC 에 있어야 sync 가 import",
])

content_slide("§4. Identity Center 학생 셋업", [
    "1.  AWS Console → IAM Identity Center → Groups → Create group (학교명, 예: chosun-univ)",
    "2.  Users → Add user (학생별 — username, email, 실명)",
    "3.  Add users to group → 학교 그룹에 학생 추가",
    "4.  학생들에게 Kiro 라이선스 (Permission set) 부여 — Kiro Console 또는 IC 에서 직접",
],
    note="이미 운영 중이면 skip. 처음이면 학교별로 그룹 + 학생 추가 후 진행.")

screenshot_slide(
    "§4. Identity Center store ID 확인",
    "AWS Console → IAM Identity Center → 좌측 [설정] → 자격 증명 소스 영역 → Identity Store ID",
    [
        "store ID 형식: d-XXXXXXXXXX (d- 로 시작하는 10자리 hex). 거의 안 바뀜.",
        "/admin/connections 에서 'IC 인스턴스 ID' 칸에 이 값 그대로 붙여넣기.",
        "Settings 페이지가 안 보이면 Identity Center 가 활성화 안 됨 — Enable 먼저.",
    ],
    image_path=r"c:/tmp/ppt-captures/slide09_pic1.png"
)

screenshot_slide(
    "§4. 학교 그룹 + 학생 등록 상태",
    "AWS Console → IAM Identity Center → Groups → 학교 그룹 클릭 → Users 탭",
    [
        "그룹명 = /admin/schools 의 학교 id (예: chosun-univ). sync 가 이 이름 그대로 학교 id 로 사용.",
        "학생 username 은 학생이 사이트 로그인할 때 쓰는 아이디. 알아보기 쉽게 (예: gju-25).",
        "학생 email 은 비번 재설정 이메일 받을 주소 — 정확히 입력.",
    ]
    # 신규 캡처 필요 — placeholder
)

# === §5 connection 등록 ===
section_divider("5", "connection 등록 + 검증", [
    "/admin/connections 에서 ＋ 새 connection 등록",
    "Role ARN 비움 (same-account)",
    "📡 연결 테스트 → 성공 후 자동 cron 사이클 진입",
])

content_slide("§5. connection 등록 필드", [
    "•  id : 식별자. 영문 소문자/숫자/하이픈, 2~32자. 예: tbit-main",
    "•  표시명 : 사람이 읽는 이름. 예: TBIT 메인 AWS",
    "•  AWS 계정 ID : 12자리 숫자. 우리 계정 번호",
    "•  Role ARN : 비움 (cross-account 아님)",
    "•  IC 인스턴스 ID / 리전 : §4 에서 확인한 store ID + 리전 (보통 us-east-1)",
    "•  S3 버킷 / prefix / 리전 : §1 에서 만든 버킷 + §2 에서 지정한 prefix + 리전",
])

code_slide("§5. 채워진 예시 (TBIT same-account)", '''id              : tbit-main
표시명          : TBIT 메인 AWS
AWS 계정 ID    : 123456789012
Role ARN       : (비움)
IC 인스턴스 ID : d-1234567890
IC 리전        : us-east-1
S3 버킷        : tbit-kiro-prod
S3 prefix      : kiro-reports
S3 리전        : us-east-1''',
    note="모든 값 예시. 실제 운영 시 본인 AWS 계정/버킷/IC store ID 로 교체.")

screenshot_slide(
    "§5. connection 등록 화면",
    "/admin/connections → ＋ 새 connection 등록 → 폼 채운 상태",
    [
        "Role ARN 칸은 비워둘 것 (cross-account 아님). 비우면 우리 base 자격증명 사용.",
        "저장 후 펼친 행에서 📡 연결 테스트 버튼 클릭 → 상단 배너로 결과 확인.",
        "테스트 통과하면 다음 자정 (00:00 KST) sync 자동 + 11:05 KST ingest 자동.",
    ],
    image_path=r"c:/tmp/ppt-captures/slide12_pic1.png"
)

screenshot_slide(
    "§5. 연결 테스트 성공 배너",
    "/admin/connections 상단의 초록 배너",
    [
        "STS skip / IC 그룹 N개 ✓ / S3 객체 N개 ✓ 세 단계 모두 통과해야 정상.",
        "IC 그룹 0개 = 그룹 아직 안 만들었거나 store ID 오타.",
        "S3 객체 0개 = Kiro 가 아직 첫 CSV 안 떨어뜨림 (정상 — 다음 날 새벽 기대).",
        "실패 시 빨간 배너에 에러 메시지 — §3 IAM 권한 우선 확인.",
    ]
    # 신규 캡처 필요 — placeholder
)

# === §6 운영 ===
content_slide("§6. 운영 — 자동 cron 사이클", [
    "•  매일 00:00 KST (= 15:00 UTC 전날)  sync-identity-center",
    "    └  IC 그룹/사용자 → schools/students 자동 등록. 기존 행 절대 건드림 X",
    "•  매일 11:05 KST (= 02:05 UTC)  ingest",
    "    └  S3 의 어제 자 CSV 파싱 → daily_usage 적재 → 스냅샷 재계산",
    "•  학생/어드민 페이지는 스냅샷만 SELECT — 페이지 응답 항상 빠름",
    "•  systemd timer 로 자동 실행 (서버 ops/systemd/kiro-*.timer)",
])

content_slide("§6. 문제 해결", [
    "•  UnrecognizedClientException : 우리 AWS 자격증명 만료/오타. 컨테이너 재기동 + .env 확인",
    "•  AccessDenied (S3) : §3 정책에 S3 read 권한 누락. 같은 계정이어도 명시 필요",
    "•  AccessDenied (IC) : §3 정책에 identitystore:* 누락",
    "•  sync 가 그룹 0개로 끝남 : IC 인스턴스 ID 오타 (d- 로 시작하는지 확인)",
    "•  CSV 파일 없음 : Kiro 가 11:00 KST 에 전날 자 떨어뜨림. 오늘 분은 내일 새벽",
    "•  학생 사용량 0 : sync 가 먼저 학생 행 만들어야 ingest 가 매핑함 (orphan 카운트 확인)",
])

# === §7 v1.0 예고 ===
content_slide("v1.0 에서 추가 예정 — cross-account", [
    "•  학교가 자기 AWS 계정 + 자기 Identity Center + 자기 S3 운영하는 경우",
    "•  우리 계정에서 STS AssumeRole 로 그쪽 접근",
    "•  학교 측이 IAM Role 생성 (trust policy + 권한 정책) 후 Role ARN 우리에게 전달",
    "•  우리는 connection 등록 시 Role ARN 칸 채움",
    "•  나머지 흐름은 같음 — sync + ingest 동일하게 자동 동작",
    "",
    "📌  v0.9 운영 안정화 후 v1.0 작업 예정.",
])

content_slide("마치며", [
    "•  cron : 매일 00:00 KST sync, 11:05 KST ingest (systemd timer)",
    "•  수동 실행 : docker exec kiro-next npm run sync-identity-center / ingest",
    "•  비번 갱신 : 90일 경과 시 admin 로그인 후 모달 — 30일 미루기 가능",
    "•  sync 안전성 : 기존 학생/비번 절대 안 건드림 (ON CONFLICT DO NOTHING)",
    "•  ingest 안전성 : 멱등 (같은 날짜 재실행 시 덮어쓰기, 이중 적재 X)",
    "•  자료 : /admin/connections 에서 이 가이드 PDF 다운로드",
])

prs.save(r"c:/tmp/aws-connection-guide-v0.9.pptx")
print("Saved: c:/tmp/aws-connection-guide-v0.9.pptx")
print("Slides:", len(prs.slides))
`;

const pyFile = "c:/tmp/_gen-ppt.py";
writeFileSync(pyFile, py);
const r = spawnSync("python", [pyFile], { encoding: "utf-8" });
console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
process.exit(r.status ?? 0);
