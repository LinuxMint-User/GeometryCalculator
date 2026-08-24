<template>
  <q-btn class="text-negative" @click="dialogOpen = true" :icon="ionTrashOutline">删除对象</q-btn>
  <q-dialog v-model="dialogOpen" persistent>
    <q-card>
      <q-form @reset="reset" @submit="submit">
        <q-card-section>
          <h1 class="text-negative">删除对象</h1>
          <q-select v-model="toDel" :options="options" dense>
            <!-- 选项和选中项都用 v-html + renderToString 渲染，而不是 v-katex 指令：
                 v-katex 会直接修改 DOM，破坏 Vue 的虚拟 DOM 同步，
                 导致 QSelect 在选择后报错且无法再更改选择（issue #1） -->
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label><span v-html="renderLatex(scope.opt)"></span></q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <!-- 注意：Quasar 类型定义中 selected 插槽没有 scope 参数，这里直接用 toDel -->
            <template v-slot:selected>
              <span v-html="renderLatex(toDel ?? '')"></span>
            </template>
          </q-select>
          <div v-if="toDel !== null">
            确定删除 <span v-html="renderLatex(toDel)"></span> 吗？
          </div>
          <div v-if="deeplyRequiredBy.length > 0">
            <div>依赖它的对象也会一并被删除：</div>
            <div v-for="latex in deeplyRequiredBy" :key="latex" v-html="renderLatex(latex)"></div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup type="reset">取消</q-btn>
          <q-btn
            v-close-popup
            type="submit"
            class="bg-negative text-white"
            :disable="toDel === null"
            >确认
          </q-btn>
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ionTrashOutline } from '@quasar/extras/ionicons-v8';
import { ref, computed, watch } from 'vue';
import { useDataStore } from 'stores/data';
import katex from 'katex';
import { updateState } from 'components/add/updateState';

const problem = window.pywebview.api.problem;

const dialogOpen = ref(false);

const dataStore = useDataStore();

const toDel = ref<string | null>(null);
const options = computed(() =>
  dataStore.symbolNames.concat(dataStore.pointNames).concat(dataStore.condIds),
);

/**
 * 把 LaTeX 字符串渲染成 HTML。
 * 相比 v-katex 指令直接改 DOM，这里用 v-html 交给 Vue 管理，
 * 避免在动态更新的区域（QSelect、v-for 列表）破坏虚拟 DOM 同步（issue #1）。
 */
function renderLatex(latex: string) {
  return katex.renderToString(latex, { throwOnError: false });
}

function reset() {
  toDel.value = null;
  deeplyRequiredBy.value = [];
}

const deeplyRequiredBy = ref<Array<string>>([]);

watch(toDel, () => {
  if (toDel.value !== null) {
    void problem.get_deeply_required_by(toDel.value).then((result) => {
      deeplyRequiredBy.value = result;
    });
  }
});

function submit() {
  // 删除该对象及其依赖
  void problem.del_objs(deeplyRequiredBy.value.concat([toDel.value as string])).then(() => {
    updateState();
  });
  reset();
}
</script>
