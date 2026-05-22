# 타 조직 (Cross-Account) S3 접근 가이드

> **현재 v1.1 운영 단계에서는 미사용** — 모든 학교가 TBIT 단일 AWS 계정 (498307943987) 의 IAM Identity Center / S3 를 공유. 이 문서는 새 학교가 본인 AWS 계정을 가져올 때 (향후 시나리오) 참고용.

새로 합류하는 학교/조직이 본인 AWS 계정의 S3 버킷에 Kiro 리포트를 떨어뜨리는데, **우리 인제스트 서버가 그걸 읽어야** 합니다. 두 가지 방법 중 학교 사정에 맞춰 고르세요.

| 우리 측 | TBIT 측 IAM 사용자 (계정 ID 는 학교 측에 별도 공유) |
|---|---|
| 학교 측 | 자기 AWS 계정 + 자기 S3 버킷 (예: `school-xyz-kiro`, 계정 ID `111122223333`) |

---

## 방법 A — 버킷 정책 (간단, 추천)

학교가 자기 버킷에 **bucket policy** 한 줄 추가해서 우리 IAM 사용자에게 read 권한 부여.

### 학교 측 작업

1. AWS Console → S3 → 본인 버킷 (`school-xyz-kiro`) → **Permissions** → **Bucket policy** → Edit
2. 다음 정책 붙여넣기 (학교 사람한테 그대로 전달하면 됨):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowKiroIngestRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<our-account-id>:user/<our-iam-user-name>"
      },
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::school-xyz-kiro",
        "arn:aws:s3:::school-xyz-kiro/*"
      ]
    },
    {
      "Sid": "AllowKiroServiceWrite",
      "Effect": "Allow",
      "Principal": { "Service": "kiro.amazonaws.com" },
      "Action": [
        "s3:GetBucketAcl",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::school-xyz-kiro",
        "arn:aws:s3:::school-xyz-kiro/*"
      ],
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    }
  ]
}
```

⚠ `<our-iam-user-name>` 자리에 실제 IAM 사용자명 채우기. 모르면 우리 콘솔 → IAM → Users 에서 access key 옆 사용자명 확인.

⚠ `school-xyz-kiro` 두 곳, `111122223333` 한 곳을 학교 자기 값으로 교체.

### 우리 측 작업

`/admin/schools` 에서 학교 등록할 때:
- **id**: 예 `xyz`
- **이름**: 예 `XYZ 대학교`
- **AWS 계정 ID**: `111122223333` (학교 계정)
- **S3 버킷명**: `school-xyz-kiro`
- **S3 prefix**: Kiro Console 에서 학교가 지정한 prefix (예: `kiro-reports`)
- **AWS 리전**: 버킷이 있는 리전 (보통 `us-east-1` 또는 학교 선택)
- **Role ARN**: **비워둠** (방법 A 는 role 안 씀)

이제 인제스트가 우리 base 자격증명으로 학교 버킷에 직접 접근합니다.

---

## 방법 B — IAM Role + STS AssumeRole (확장성 좋음)

학교가 자기 계정에 **IAM Role** 을 만들고, 우리 계정만 그 role 을 assume 할 수 있게 신뢰관계를 설정. 우리 인제스트는 STS 로 임시 자격증명을 받아서 학교 S3 에 접근.

장점: 학교가 자기 버킷 정책을 우리 IAM 사용자로 직접 가리키지 않아도 됨. 권한 회전/취소가 학교 측에서 자유로움.

### 학교 측 작업

#### 1) 신뢰 정책 (trust policy)

IAM → Roles → Create role → **Custom trust policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<our-account-id>:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "<사전 합의한 외부 ID>"
        }
      }
    }
  ]
}
```

`sts:ExternalId` 는 confused deputy 공격 방어용. 학교마다 다르게 정해서 우리한테 알려줘야 함. (TODO: ingest 코드에 ExternalId 지원 추가 필요 — 지금은 안 씀)

#### 2) 권한 정책 (permission policy)

같은 Role 에 attach:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::school-xyz-kiro",
        "arn:aws:s3:::school-xyz-kiro/*"
      ]
    }
  ]
}
```

#### 3) Role 생성 후 ARN 전달

생성된 Role ARN (예: `arn:aws:iam::111122223333:role/KiroIngestRead`) 을 우리에게 알려주기.

### 우리 측 작업

`/admin/schools` 에서:
- 다른 필드는 방법 A 와 동일
- **Role ARN**: `arn:aws:iam::111122223333:role/KiroIngestRead` ← 학교가 알려준 값

[`ingest/s3.ts`](ingest/s3.ts) 가 자동으로 감지:
- `role_arn` 있으면 → STS AssumeRole → 임시 자격증명으로 S3 접근
- `role_arn` 없으면 → 우리 base 자격증명 직접 사용

---

## 비교

| 항목 | 방법 A (버킷 정책) | 방법 B (Role + AssumeRole) |
|---|---|---|
| 학교 측 설정 난이도 | 쉬움 (JSON 한 번 붙여넣기) | 중간 (Role + trust + permission) |
| 우리 측 설정 | DB 에 S3 정보만 | DB 에 S3 정보 + Role ARN |
| 권한 취소 | 학교가 정책 라인 삭제 | 학교가 Role 삭제 |
| Confused Deputy 방어 | 약함 | 강함 (ExternalId) |
| 권한 만료 | 영구 | 임시 (STS 세션 1시간 갱신) |
| 추천 시점 | MVP / 학교 수 적을 때 | 학교 수 많아지거나 보안 강화 필요할 때 |

---

## 점검 절차 (학교 1곳 추가 후)

1. `/admin/schools` 에서 학교 등록
2. 학교 측에 정책 적용 완료 확인
3. 서버에서 직접 테스트:

```bash
# 우리 IAM 사용자로 직접 시도 (방법 A 검증)
docker compose -f docker-compose.prod.yml exec next sh -c \
  "AWS_REGION=us-east-1 aws s3 ls s3://school-xyz-kiro/"

# 또는 인제스트 dry-run (방법 A/B 모두)
docker compose -f docker-compose.prod.yml exec next \
  npm run ingest -- --date 2026-05-19
# 로그에서 학교 id 옆에 "rows=N" 떠야 정상
```

4. DB 확인:
```bash
docker exec kiro-pg psql -U kiro -d kiro -c \
  "SELECT school_id, count(*) FROM daily_usage GROUP BY school_id;"
```

학교 id 마다 행 수가 보이면 인제스트 성공.

---

## 문제 진단

| 증상 | 원인 후보 |
|---|---|
| `AccessDenied` | 방법 A — 버킷 정책에 우리 IAM ARN 오타 / 방법 B — Role trust 에 우리 계정 ID 오타 |
| `NoSuchBucket` | 버킷명 오타 또는 리전 불일치 |
| `PermanentRedirect` | DB 에 등록한 `aws_region` 이 실제 버킷 리전과 다름 — `/admin/schools` 편집해서 맞추기 |
| Kiro Setup marker 만 있고 실제 CSV 없음 | Kiro 가 아직 첫 일일 리포트를 안 만듦. 매일 02:00 UTC 갱신 — 다음날 다시 확인 |
| `InvalidAccessKeyId` | 우리 IAM 사용자 access key 비활성/삭제됨. AWS Console → IAM → 새 키 발급 → `.env` 갱신 → 컨테이너 재시작 |
