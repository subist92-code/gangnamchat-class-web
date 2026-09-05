import { z } from 'zod';
import { courseSchema } from '../folder/schemas/common';

/**
 * 노드맵 번들 — 정본은 강남챗 2.0(H-4). 이 리포는 읽기 전용 소비자.
 * 앱은 이름을 표시만 하고 절대 편집·보정하지 않는다.
 * 엣지는 번들에 없다(본체 DB node_edges 단일 출처 · R2 전 별도 SNAP).
 *
 * 형식은 실제 SNAP 파일(docs/정본스냅샷/nodemap.bundle.<course>.json)을 따른다.
 * 지시서 §5-4 의 제안 형식과 다른 점(version 객체 · source 배열 · common_basic ·
 * dead_labels · counts · subs[].backend_only · prerequisites 부재)은 규격 v0.4 후보.
 */
export const nodemapSubSchema = z.object({
  id: z.string(),
  name: z.string(),
  backend_only: z.boolean().optional(),
});

export const nodemapMidSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain_group: z.string().optional(),
  subs: z.array(nodemapSubSchema),
});

export const nodemapCommonBasicSchema = z.object({
  id: z.string(),
  name: z.string(),
  subgroup: z.string().optional(),
});

export const nodemapBundleSchema = z.object({
  spec: z.string().regex(/^gc-class-nodemap\/\d+\.\d+$/),
  course: courseSchema,
  version: z.union([
    z.string(),
    z.object({ doc: z.string(), code: z.string().optional() }),
  ]),
  source: z
    .array(z.object({ file: z.string(), md5: z.string() }))
    .optional(),
  copied_at: z.string().optional(),
  edges: z.string().optional(),
  mids: z.array(nodemapMidSchema),
  common_basic: z.array(nodemapCommonBasicSchema).optional(),
  dead_labels: z.array(z.string()).optional(),
  counts: z.record(z.string(), z.number()).optional(),
});

export type NodemapSub = z.infer<typeof nodemapSubSchema>;
export type NodemapMid = z.infer<typeof nodemapMidSchema>;
export type NodemapBundle = z.infer<typeof nodemapBundleSchema>;

/** class.json.nodemap.version 에 박히는 문자열. 픽스처면 "fixture". */
export function bundleVersionLabel(bundle: NodemapBundle): string {
  return typeof bundle.version === 'string' ? bundle.version : bundle.version.doc;
}

/** 픽스처 번들인가 — 픽스처면 문항 저장을 막는다(자리 A). */
export function isFixtureBundle(bundle: NodemapBundle): boolean {
  return bundleVersionLabel(bundle) === 'fixture';
}
